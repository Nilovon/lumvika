import { authAccounts, authSessions, authUsers } from '@lumvika/db/schema'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fakeScope, type DbCall } from '@/test/db-fake'

vi.mock('server-only', () => ({}))

const db = await vi.hoisted(async () => (await import('@/test/db-fake')).fakeDb())
const auth = vi.hoisted(() => ({ writes: [] as { method: 'delete' | 'update'; table: unknown; values?: unknown }[] }))

vi.mock('@/lib/db', async importOriginal => ({
    ...(await importOriginal<object>()),
    ...db.helpers,
    inTransaction: async (scope: unknown, work: (scope: unknown) => Promise<unknown>) =>
        work({
            ...(scope as object),
            run: (inner: (executor: unknown) => Promise<unknown>) =>
                inner({
                    delete: (table: unknown) => ({ where: async () => auth.writes.push({ method: 'delete', table }) }),
                    update: (table: unknown) => ({ set: (values: unknown) => ({ where: async () => auth.writes.push({ method: 'update', table, values }) }) }),
                }),
        }),
}))

const mocks = vi.hoisted(() => ({
    subscriptionStillCharges: vi.fn(),
    stopWorkspaceCharges: vi.fn(),
    uninstallWorkspaceApps: vi.fn(),
    listObjects: vi.fn(),
    removeObjects: vi.fn(),
}))

vi.mock('@lumvika/cloud/account', () => ({ subscriptionStillCharges: mocks.subscriptionStillCharges, stopWorkspaceCharges: mocks.stopWorkspaceCharges, uninstallWorkspaceApps: mocks.uninstallWorkspaceApps }))
vi.mock('@lumvika/storage', () => ({ listObjects: mocks.listObjects, removeObjects: mocks.removeObjects }))

const { accountDeletionBlockers, anonymizeAccount, ACCOUNT_DELETED_REASON } = await import('./account-deletion.service')

const USER = 'user-leaving'
const TEAMMATE = 'user-staying'
const admin = fakeScope('service')

type WorkspaceRow = { id: number; name: string; is_sandbox: boolean; stripe_customer_id: string | null; stripe_subscription_id: string | null; subscription_status: string | null }

const SHARED: WorkspaceRow = { id: 1, name: 'Acme', is_sandbox: false, stripe_customer_id: 'cus_acme', stripe_subscription_id: 'sub_acme', subscription_status: 'active' }
const OWN: WorkspaceRow = { id: 2, name: 'Side project', is_sandbox: false, stripe_customer_id: 'cus_side', stripe_subscription_id: 'sub_side', subscription_status: 'trialing' }

type MemberRow = { workspace_id: number; user_id: string; role?: 'admin' | 'member' }

function matches(row: Record<string, unknown>, filters: Record<string, unknown>) {
    return Object.entries(filters).every(([column, filter]) => {
        if (Array.isArray(filter)) return filter.includes(row[column])
        if (filter && typeof filter === 'object' && 'neq' in filter) return row[column] !== (filter as { neq: unknown }).neq
        return row[column] === filter
    })
}

function membersMatching(members: MemberRow[], call: DbCall) {
    const rows = members.map(member => ({ role: 'admin', ...member }) as Record<string, unknown>)
    const filters = (call.helper === 'selectCount' ? call.args[0] : call.args[1]) as Record<string, unknown>
    const matching = rows.filter(row => matches(row, filters))
    if (call.helper === 'selectCount') return { data: matching.length }
    if (call.helper === 'selectMaybeSingle') return { data: matching[0] ?? null }
    return { data: matching }
}

const WRITES = new Set<DbCall['helper']>(['insertRows', 'insertRow', 'updateRows', 'deleteRows', 'upsertRows'])

function world(workspaces: WorkspaceRow[], members: MemberRow[]) {
    db.answer(call => {
        if (WRITES.has(call.helper)) return undefined
        if (call.table === 'workspace_members') return membersMatching(members, call)
        if (call.table === 'workspaces') return { data: workspaces }
        return undefined
    })
}

const writes = (table: string) => db.calls.filter(call => WRITES.has(call.helper) && call.table === table)

beforeEach(() => {
    vi.clearAllMocks()
    db.reset()
    auth.writes = []
    mocks.stopWorkspaceCharges.mockResolvedValue(undefined)
    mocks.uninstallWorkspaceApps.mockResolvedValue(undefined)
    mocks.subscriptionStillCharges.mockResolvedValue(false)
    mocks.listObjects.mockResolvedValue({ data: [{ name: 'a.webp', size: 1, updatedAt: null }], error: null })
    mocks.removeObjects.mockResolvedValue({ data: { removed: 1 }, error: null })
})

describe('accountDeletionBlockers', () => {
    it('names a workspace only this user is in whose plan still renews', async () => {
        mocks.subscriptionStillCharges.mockResolvedValue(true)
        world([OWN], [{ workspace_id: OWN.id, user_id: USER }])

        await expect(accountDeletionBlockers(admin, USER)).resolves.toEqual([{ workspaceId: OWN.id, name: OWN.name }])
    })

    it('lets a workspace whose plan no longer charges go', async () => {
        world([OWN], [{ workspace_id: OWN.id, user_id: USER }])

        await expect(accountDeletionBlockers(admin, USER)).resolves.toEqual([])
        expect(mocks.subscriptionStillCharges).toHaveBeenCalledExactlyOnceWith('sub_side')
    })

    it('leaves a shared workspace to its other members, whatever its plan', async () => {
        world(
            [SHARED],
            [
                { workspace_id: SHARED.id, user_id: USER },
                { workspace_id: SHARED.id, user_id: TEAMMATE },
            ]
        )

        await expect(accountDeletionBlockers(admin, USER)).resolves.toEqual([])
        expect(mocks.subscriptionStillCharges).not.toHaveBeenCalled()
    })
})

describe('anonymizeAccount', () => {
    it('refuses without writing anything while a plan still renews', async () => {
        mocks.subscriptionStillCharges.mockResolvedValue(true)
        world([OWN], [{ workspace_id: OWN.id, user_id: USER }])

        await expect(anonymizeAccount(admin, USER)).resolves.toEqual({ ok: false, blockers: [{ workspaceId: OWN.id, name: OWN.name }] })
        expect(db.calls.filter(call => WRITES.has(call.helper))).toEqual([])
        expect(auth.writes).toEqual([])
        expect(mocks.stopWorkspaceCharges).not.toHaveBeenCalled()
    })

    it('leaves a shared workspace and shuts down an own one', async () => {
        world(
            [SHARED, OWN],
            [
                { workspace_id: SHARED.id, user_id: USER },
                { workspace_id: SHARED.id, user_id: TEAMMATE },
                { workspace_id: OWN.id, user_id: USER },
            ]
        )

        await expect(anonymizeAccount(admin, USER)).resolves.toEqual({ ok: true })

        const [leave] = writes('workspace_members')
        expect(leave.helper).toBe('deleteRows')
        expect(leave.args[0]).toEqual({ workspace_id: SHARED.id, user_id: USER })

        expect(mocks.stopWorkspaceCharges).toHaveBeenCalledExactlyOnceWith(admin, expect.objectContaining({ id: OWN.id, stripeCustomerId: 'cus_side', isSandbox: false }))
        expect(mocks.uninstallWorkspaceApps).toHaveBeenCalledExactlyOnceWith(admin, OWN.id)
        const [agents] = writes('agents')
        expect(agents.args[0]).toMatchObject({ disabled_reason: ACCOUNT_DELETED_REASON })
        expect(agents.args[1]).toEqual({ workspace_id: OWN.id, disabled_at: { isNull: true } })
        expect(writes('workspaces').map(write => write.args[1])).toEqual([{ id: OWN.id }])
    })

    it('hands a shared workspace to the earliest teammate when its last admin leaves', async () => {
        world(
            [SHARED],
            [
                { workspace_id: SHARED.id, user_id: USER, role: 'admin' },
                { workspace_id: SHARED.id, user_id: TEAMMATE, role: 'member' },
            ]
        )

        await expect(anonymizeAccount(admin, USER)).resolves.toEqual({ ok: true })

        const [promote, leave] = writes('workspace_members')
        expect(promote.helper).toBe('updateRows')
        expect(promote.args.slice(0, 2)).toEqual([{ role: 'admin' }, { workspace_id: SHARED.id, user_id: TEAMMATE }])
        expect(leave.helper).toBe('deleteRows')
    })

    it('promotes no one when another admin stays', async () => {
        world(
            [SHARED],
            [
                { workspace_id: SHARED.id, user_id: USER, role: 'admin' },
                { workspace_id: SHARED.id, user_id: TEAMMATE, role: 'admin' },
            ]
        )

        await expect(anonymizeAccount(admin, USER)).resolves.toEqual({ ok: true })

        expect(writes('workspace_members').map(write => write.helper)).toEqual(['deleteRows'])
    })

    it('erases what points to the person, then files the auth row under a dead address, last', async () => {
        world([OWN], [{ workspace_id: OWN.id, user_id: USER }])

        await anonymizeAccount(admin, USER)

        expect(writes('user_presence')).toEqual([expect.objectContaining({ helper: 'deleteRows' })])
        expect(writes('users')[0].args[0]).toMatchObject({ onboarding_answers: null, deleted_at: expect.any(String) })
        expect(mocks.listObjects).toHaveBeenCalledWith('user-avatars', USER)
        expect(mocks.removeObjects).toHaveBeenCalledWith('user-avatars', [`${USER}/a.webp`])

        expect(auth.writes.map(write => [write.method, write.table])).toEqual([
            ['delete', authSessions],
            ['delete', authAccounts],
            ['update', authUsers],
        ])
        expect(auth.writes[2].values).toMatchObject({ email: `${USER}@deleted.lumvika.com`, name: '', image: null })
    })

    it('stops before the auth row when billing could not be stopped', async () => {
        mocks.stopWorkspaceCharges.mockRejectedValue(new Error('Stripe is down'))
        world([OWN], [{ workspace_id: OWN.id, user_id: USER }])

        await expect(anonymizeAccount(admin, USER)).rejects.toThrow('Stripe is down')
        expect(auth.writes).toEqual([])
        expect(writes('users')).toEqual([])
    })
})
