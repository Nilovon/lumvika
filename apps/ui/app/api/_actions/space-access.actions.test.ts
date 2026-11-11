import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { DbCall } from '@/test/db-fake'

const db = await vi.hoisted(async () => (await import('@/test/db-fake')).fakeDb())
vi.mock('@/lib/db', async importOriginal => ({ ...(await importOriginal<object>()), ...db.helpers }))

const mocks = vi.hoisted(() => ({ getServerSession: vi.fn(), emails: {} as Record<string, string> }))

vi.mock('@/lib/auth/session/getServerSession', () => ({ getServerSession: mocks.getServerSession, getSessionWorkspace: mocks.getServerSession }))
vi.mock('@/app/api/_services/members.service', async importOriginal => ({
    ...(await importOriginal<object>()),
    resolveMemberIdentities: async (_scope: unknown, ids: string[]) => new Map(ids.filter(id => mocks.emails[id]).map(id => [id, { email: mocks.emails[id], name: null, avatarUrl: null }])),
}))

const { getSpaceAccessAction, grantSpaceAccessAction, listMemberAccessAction, revokeSpaceAccessAction, setSpaceVisibilityAction } = await import('./space-access.actions')

type Row = Record<string, unknown>
type Write = { method: 'upsert' | 'update' | 'delete'; payload?: unknown; filters?: Row }

const WORKSPACE_ID = 7
const ME = 'user-me'
const ADMIN_ONLY = { ok: false, error: 'Only an admin can change who can access a Box', code: 'adminOnlyBoxAccess' }

const READS = new Set<DbCall['helper']>(['selectSingle', 'selectMaybeSingle', 'selectFirst', 'selectMany', 'selectAll'])

function matches(row: Row, filters: Row): boolean {
    return Object.entries(filters).every(([column, value]) => (Array.isArray(value) ? value.includes(row[column]) : row[column] === value))
}

function tableResolver(rows: Record<string, Row[]>) {
    return (call: DbCall) => {
        if (!READS.has(call.helper)) return undefined
        const matching = (rows[call.table] ?? []).filter(row => matches(row, call.args[1] as Row))
        if (call.helper === 'selectMany' || call.helper === 'selectAll') return { data: matching }
        return { data: matching[0] ?? null }
    }
}

function database(rows: Record<string, Row[]>, emails: Record<string, string> = {}) {
    mocks.emails = emails
    db.answer(tableResolver(rows))
}

function writeOf(call: DbCall): Write | null {
    if (call.helper === 'upsertRows') return { method: 'upsert', payload: call.args[0] }
    if (call.helper === 'updateRows') return { method: 'update', payload: call.args[0], filters: call.args[1] as Row }
    if (call.helper === 'deleteRows') return { method: 'delete', filters: call.args[0] as Row }
    return null
}

const writes = (table?: string): Write[] => db.calls.filter(call => table === undefined || call.table === table).flatMap(call => writeOf(call) ?? [])

function member(userId: string, role: 'admin' | 'member' = 'member', boxScope: 'all' | 'assigned' = 'all', workspaceId = WORKSPACE_ID): Row {
    return { user_id: userId, workspace_id: workspaceId, role, box_scope: boxScope }
}

function space(id: string, visibility: 'workspace' | 'restricted' = 'workspace', workspaceId = WORKSPACE_ID): Row {
    return { id, workspace_id: workspaceId, name: `Box ${id}`, visibility }
}

function grant(spaceId: string, userId: string, access: 'use' | 'manage', grantedBy: string | null = ME): Row {
    return { space_id: spaceId, user_id: userId, workspace_id: WORKSPACE_ID, access, granted_by: grantedBy }
}

beforeEach(() => {
    vi.clearAllMocks()
    db.reset()
    mocks.getServerSession.mockResolvedValue({
        user: { id: ME, workspace_id: WORKSPACE_ID },
        workspace: { id: WORKSPACE_ID, name: 'Acme', max_seats: null },
        session: { id: ME, email: 'me@acme.test' },
        workspaceRefused: false,
    })
})

describe('a member', () => {
    it('cannot read nor change who can access a Box', async () => {
        database({ workspace_members: [member(ME), member('user-2')], spaces: [space('box-1')] })

        await expect(getSpaceAccessAction('box-1')).resolves.toEqual(ADMIN_ONLY)
        await expect(setSpaceVisibilityAction('box-1', 'restricted')).resolves.toEqual(ADMIN_ONLY)
        await expect(grantSpaceAccessAction('box-1', ['user-2'], 'use')).resolves.toEqual(ADMIN_ONLY)
        await expect(revokeSpaceAccessAction('box-1', 'user-2')).resolves.toEqual(ADMIN_ONLY)
        expect(writes()).toHaveLength(0)
    })
})

describe('getSpaceAccessAction', () => {
    it('lists the Box, its coworkers, its people and the members to pick from', async () => {
        database(
            {
                workspace_members: [member(ME, 'admin'), member('user-2'), member('user-3')],
                spaces: [space('box-1', 'restricted')],
                agents: [{ id: 'agent-1', name: 'Scout', workspace_id: WORKSPACE_ID, space_id: 'box-1' }, { id: 'agent-2', name: 'Elsewhere', workspace_id: WORKSPACE_ID, space_id: 'box-2' }],
                space_members: [grant('box-1', 'user-2', 'manage', 'user-2'), grant('box-1', 'user-3', 'use')],
            },
            { [ME]: 'me@acme.test', 'user-2': 'two@acme.test' },
        )

        const result = await getSpaceAccessAction('box-1')

        expect(result).toEqual({
            ok: true,
            spaceId: 'box-1',
            name: 'Box box-1',
            visibility: 'restricted',
            coworkers: [{ id: 'agent-1', name: 'Scout' }],
            people: [
                { userId: 'user-2', access: 'manage', grantedBy: 'user-2', createdBox: true },
                { userId: 'user-3', access: 'use', grantedBy: ME, createdBox: false },
            ],
            members: [
                { userId: ME, email: 'me@acme.test', role: 'admin' },
                { userId: 'user-2', email: 'two@acme.test', role: 'member' },
                { userId: 'user-3', email: null, role: 'member' },
            ],
        })
    })

    it('answers not found for a Box of another workspace', async () => {
        database({ workspace_members: [member(ME, 'admin')], spaces: [space('box-1', 'workspace', 99)] })

        await expect(getSpaceAccessAction('box-1')).resolves.toEqual({ ok: false, error: 'Box not found', code: 'boxNotFound' })
    })
})

describe('setSpaceVisibilityAction', () => {
    it('restricts a Box of the workspace', async () => {
        database({ workspace_members: [member(ME, 'admin')], spaces: [space('box-1')] })

        await expect(setSpaceVisibilityAction('box-1', 'restricted')).resolves.toEqual({ ok: true })

        const [write] = writes('spaces')
        expect(write).toMatchObject({ method: 'update', payload: { visibility: 'restricted' } })
        expect(write.filters).toEqual({ id: 'box-1', workspace_id: WORKSPACE_ID })
    })

    it('leaves a Box of another workspace alone', async () => {
        database({ workspace_members: [member(ME, 'admin')], spaces: [space('box-1', 'workspace', 99)] })

        await expect(setSpaceVisibilityAction('box-1', 'restricted')).resolves.toEqual({ ok: false, error: 'Box not found', code: 'boxNotFound' })
        expect(writes('spaces')).toHaveLength(0)
    })

    it('refuses a visibility it does not know', async () => {
        database({ workspace_members: [member(ME, 'admin')], spaces: [space('box-1')] })

        await expect(setSpaceVisibilityAction('box-1', 'public' as never)).resolves.toEqual({ ok: false, error: 'Unknown visibility', code: 'unknownVisibility' })
        expect(writes('spaces')).toHaveLength(0)
    })
})

describe('grantSpaceAccessAction', () => {
    it('names members on the Box, once each', async () => {
        database({ workspace_members: [member(ME, 'admin'), member('user-2'), member('user-3')], spaces: [space('box-1')] })

        await expect(grantSpaceAccessAction('box-1', ['user-2', 'user-3', 'user-2'], 'use')).resolves.toEqual({ ok: true })

        const [write] = writes('space_members')
        expect(write.method).toBe('upsert')
        expect(db.callsTo('upsertRows', 'space_members')[0].args[1]).toEqual({ onConflict: ['space_id', 'user_id'] })
        expect(write.payload).toEqual([
            { space_id: 'box-1', user_id: 'user-2', workspace_id: WORKSPACE_ID, access: 'use', granted_by: ME },
            { space_id: 'box-1', user_id: 'user-3', workspace_id: WORKSPACE_ID, access: 'use', granted_by: ME },
        ])
    })

    it('changes a level without forgetting who created the Box', async () => {
        database({ workspace_members: [member(ME, 'admin'), member('user-2')], spaces: [space('box-1')], space_members: [grant('box-1', 'user-2', 'manage', 'user-2')] })

        await expect(grantSpaceAccessAction('box-1', ['user-2'], 'use')).resolves.toEqual({ ok: true })

        expect(writes('space_members')[0].payload).toEqual([{ space_id: 'box-1', user_id: 'user-2', workspace_id: WORKSPACE_ID, access: 'use', granted_by: 'user-2' }])
    })

    it('refuses an admin, who already reaches every Box', async () => {
        database({ workspace_members: [member(ME, 'admin'), member('user-2', 'admin'), member('user-3')], spaces: [space('box-1')] })

        await expect(grantSpaceAccessAction('box-1', ['user-3', 'user-2'], 'manage')).resolves.toEqual({ ok: false, error: 'Admins always have access to every Box', code: 'adminsAlwaysReachBoxes' })
        expect(writes('space_members')).toHaveLength(0)
    })

    it('refuses someone outside the workspace', async () => {
        database({ workspace_members: [member(ME, 'admin'), member('user-2', 'member', 'all', 99)], spaces: [space('box-1')] })

        await expect(grantSpaceAccessAction('box-1', ['user-2'], 'use')).resolves.toEqual({ ok: false, error: 'This user is not a member of the workspace.', code: 'userNotMember' })
        expect(writes('space_members')).toHaveLength(0)
    })

    it('refuses a Box of another workspace and a level it does not know', async () => {
        database({ workspace_members: [member(ME, 'admin'), member('user-2')], spaces: [space('box-1', 'workspace', 99), space('box-2')] })

        await expect(grantSpaceAccessAction('box-1', ['user-2'], 'use')).resolves.toEqual({ ok: false, error: 'Box not found', code: 'boxNotFound' })
        await expect(grantSpaceAccessAction('box-2', ['user-2'], 'owner' as never)).resolves.toEqual({ ok: false, error: 'Unknown access level', code: 'unknownAccessLevel' })
        expect(writes('space_members')).toHaveLength(0)
    })
})

describe('revokeSpaceAccessAction', () => {
    it('removes the row of that person on that Box', async () => {
        database({ workspace_members: [member(ME, 'admin'), member('user-2')], spaces: [space('box-1')], space_members: [grant('box-1', 'user-2', 'use')] })

        await expect(revokeSpaceAccessAction('box-1', 'user-2')).resolves.toEqual({ ok: true })

        const [write] = writes('space_members')
        expect(write.method).toBe('delete')
        expect(write.filters).toEqual({ space_id: 'box-1', user_id: 'user-2', workspace_id: WORKSPACE_ID })
    })

    it('leaves a Box of another workspace alone', async () => {
        database({ workspace_members: [member(ME, 'admin')], spaces: [space('box-1', 'workspace', 99)] })

        await expect(revokeSpaceAccessAction('box-1', 'user-2')).resolves.toEqual({ ok: false, error: 'Box not found', code: 'boxNotFound' })
        expect(writes('space_members')).toHaveLength(0)
    })
})

describe('listMemberAccessAction', () => {
    const boxes = [space('open'), space('closed', 'restricted'), space('named', 'restricted'), space('managed')]
    const agents = [
        { id: 'a1', workspace_id: WORKSPACE_ID, space_id: 'open' },
        { id: 'a2', workspace_id: WORKSPACE_ID, space_id: 'open' },
        { id: 'a3', workspace_id: WORKSPACE_ID, space_id: 'closed' },
    ]

    it('gives an admin every Box of a member, with where each level comes from', async () => {
        database({ workspace_members: [member(ME, 'admin'), member('user-2')], spaces: boxes, agents, space_members: [grant('named', 'user-2', 'use'), grant('managed', 'user-2', 'manage')] })

        const result = await listMemberAccessAction('user-2')

        expect(result).toEqual({
            ok: true,
            userId: 'user-2',
            role: 'member',
            boxScope: 'all',
            boxes: [
                { spaceId: 'open', name: 'Box open', agentCount: 2, visibility: 'workspace', access: 'use', source: 'workspace' },
                { spaceId: 'closed', name: 'Box closed', agentCount: 1, visibility: 'restricted', access: 'none', source: 'none' },
                { spaceId: 'named', name: 'Box named', agentCount: 0, visibility: 'restricted', access: 'use', source: 'assigned' },
                { spaceId: 'managed', name: 'Box managed', agentCount: 0, visibility: 'workspace', access: 'manage', source: 'assigned' },
            ],
        })
    })

    it('closes the open Boxes to a member whose scope is assigned', async () => {
        database({ workspace_members: [member(ME, 'admin'), member('user-2', 'member', 'assigned')], spaces: [space('open')], agents: [] })

        const result = await listMemberAccessAction('user-2')

        expect(result).toMatchObject({ ok: true, boxScope: 'assigned', boxes: [{ spaceId: 'open', access: 'none', source: 'none' }] })
    })

    it('reads an admin as reaching every Box', async () => {
        database({ workspace_members: [member(ME, 'admin'), member('user-2', 'admin')], spaces: [space('closed', 'restricted')], agents: [] })

        const result = await listMemberAccessAction('user-2')

        expect(result).toMatchObject({ ok: true, role: 'admin', boxes: [{ spaceId: 'closed', access: 'manage', source: 'admin' }] })
    })

    it('lets a member read themselves, without the Boxes closed to them', async () => {
        database({ workspace_members: [member(ME), member('user-2', 'admin')], spaces: boxes, agents, space_members: [grant('named', ME, 'use')] })

        const result = await listMemberAccessAction(ME)

        expect(result).toMatchObject({ ok: true, userId: ME })
        expect(result.ok && result.boxes.map(box => box.spaceId)).toEqual(['open', 'named', 'managed'])
    })

    it('refuses a member reading someone else', async () => {
        database({ workspace_members: [member(ME), member('user-2')], spaces: boxes })

        await expect(listMemberAccessAction('user-2')).resolves.toEqual({ ok: false, error: 'Only an admin can see the Boxes of another member', code: 'adminOnlyMemberBoxes' })
    })

    it('refuses someone outside the workspace', async () => {
        database({ workspace_members: [member(ME, 'admin'), member('user-2', 'member', 'all', 99)], spaces: boxes })

        await expect(listMemberAccessAction('user-2')).resolves.toEqual({ ok: false, error: 'This user is not a member of the workspace.', code: 'userNotMember' })
    })
})
