import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ selectMaybeSingle: vi.fn(), selectMany: vi.fn() }))

vi.mock('next/server', () => ({ after: vi.fn() }))
vi.mock('@lumvika/cloud/email', () => ({}))
vi.mock('@/lib/ai/generate-run-title', () => ({ generateRunTitle: vi.fn() }))
vi.mock('@lumvika/analytics/server', () => ({ captureServer: vi.fn(), deterministicUuid: vi.fn() }))
vi.mock('@/lib/auth/auth', () => ({ isAnonymousEmail: vi.fn() }))
vi.mock('@/lib/db', async importOriginal => ({ ...(await importOriginal<object>()), selectMaybeSingle: mocks.selectMaybeSingle, selectMany: mocks.selectMany }))
vi.mock('./chat.service', () => ({ ensureSessionRow: vi.fn() }))
vi.mock('./notification-audience.service', () => ({ writeNotificationPrefs: vi.fn() }))
vi.mock('./presence.service', () => ({ loadPresence: vi.fn() }))
vi.mock('./workspace-engine.service', () => ({ authenticateEngineToken: vi.fn() }))
vi.mock('./workspace-owner.service', () => ({ resolveWorkspaceMemberEmail: vi.fn(), resolveWorkspaceOwner: vi.fn() }))

const { isChannelRun, membersReachingBox } = await import('./notification.service')

const members = [
    { user_id: 'admin', role: 'admin' as const, box_scope: 'assigned' },
    { user_id: 'open', role: 'member' as const, box_scope: 'all' },
    { user_id: 'assigned', role: 'member' as const, box_scope: 'assigned' },
    { user_id: 'granted', role: 'member' as const, box_scope: 'assigned' },
]

function boxIs(visibility: string | null, grants: { user_id: string; access: string }[] = []) {
    mocks.selectMaybeSingle.mockResolvedValue({ data: visibility === null ? null : { workspace_id: 1, visibility }, error: null })
    mocks.selectMany.mockResolvedValue({ data: grants, error: null })
}

const ids = (rows: { user_id: string }[]) => rows.map(row => row.user_id)

describe('membersReachingBox', () => {
    beforeEach(() => {
        mocks.selectMaybeSingle.mockReset()
        mocks.selectMany.mockReset()
    })

    it('keeps everyone for a notification that names no Box, without reading anything', async () => {
        expect(ids(await membersReachingBox({} as never, 1, null, members))).toEqual(['admin', 'open', 'assigned', 'granted'])
        expect(mocks.selectMaybeSingle).not.toHaveBeenCalled()
    })

    it('keeps the admins, the members of scope all and the granted ones for an open Box', async () => {
        boxIs('workspace', [{ user_id: 'granted', access: 'use' }])
        expect(ids(await membersReachingBox({} as never, 1, 'box', members))).toEqual(['admin', 'open', 'granted'])
    })

    it('keeps only the admins and the granted members for a restricted Box, in one read of each table', async () => {
        boxIs('restricted', [{ user_id: 'granted', access: 'manage' }])
        expect(ids(await membersReachingBox({} as never, 1, 'box', members))).toEqual(['admin', 'granted'])
        expect(mocks.selectMaybeSingle).toHaveBeenCalledTimes(1)
        expect(mocks.selectMany).toHaveBeenCalledTimes(1)
        expect(mocks.selectMany.mock.calls[0][3]).toEqual({ space_id: 'box' })
    })

    it('keeps only the admins when the Box is gone', async () => {
        boxIs(null)
        expect(ids(await membersReachingBox({} as never, 1, 'box', members))).toEqual(['admin'])
    })
})

describe('isChannelRun', () => {
    const scope = {} as never

    beforeEach(() => {
        mocks.selectMaybeSingle.mockReset()
        mocks.selectMaybeSingle.mockResolvedValue({ data: null, error: null })
    })

    it('knows a channel run by the source a current engine names, without reading anything', async () => {
        await expect(isChannelRun(scope, 1, { source: 'channel', runId: 'run-1', sessionId: 'sess-1' })).resolves.toBe(true)
        expect(mocks.selectMaybeSingle).not.toHaveBeenCalled()
    })

    it('knows one from an older engine by the turn or the conversation the hub stored', async () => {
        mocks.selectMaybeSingle.mockImplementation(async (_scope: unknown, table: string) => ({ data: table === 'channel_agent_turns' ? { id: 'turn-1' } : null, error: null }))
        await expect(isChannelRun(scope, 1, { source: null, runId: 'run-1', sessionId: 'other' })).resolves.toBe(true)
        expect(mocks.selectMaybeSingle).toHaveBeenCalledWith(scope, 'channel_agent_turns', ['id'], { workspace_id: 1, engine_run_id: 'run-1' })

        mocks.selectMaybeSingle.mockImplementation(async (_scope: unknown, table: string) => ({ data: table === 'channel_agent_sessions' ? { channel_id: 'c1' } : null, error: null }))
        await expect(isChannelRun(scope, 1, { source: null, runId: null, sessionId: 'sess-1' })).resolves.toBe(true)
    })

    it('leaves every other run to the inbox', async () => {
        await expect(isChannelRun(scope, 1, { source: null, runId: 'run-9', sessionId: 'sess-9' })).resolves.toBe(false)
        await expect(isChannelRun(scope, 1, { source: 'schedule', runId: null, sessionId: null })).resolves.toBe(false)
    })
})
