import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    requestedWorkspaceId: null as number | null,
    memberOf: new Set<number>(),
    selectMaybeSingle: vi.fn(),
    selectSingle: vi.fn(),
}))

vi.mock('react', () => ({ cache: <T>(fn: T) => fn }))
vi.mock('@/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1', is_anonymous: false } } }) } }),
    getRequestAccessToken: async () => 'token',
    getRequestWorkspaceId: async () => mocks.requestedWorkspaceId,
}))
vi.mock('../supabase-helpers', () => ({ selectMaybeSingle: mocks.selectMaybeSingle, selectSingle: mocks.selectSingle }))

const { getServerSession } = await import('./getServerSession')

describe('getServerSession', () => {
    beforeEach(() => {
        mocks.requestedWorkspaceId = null
        mocks.memberOf = new Set([1, 2])
        mocks.selectSingle.mockReset().mockImplementation(async (_client: unknown, table: string, _columns: unknown, filters: { id?: number }) =>
            table === 'users' ? { data: { id: 'u1', workspace_id: 1 } } : { data: { id: filters.id, name: `ws ${filters.id}` } }
        )
        mocks.selectMaybeSingle.mockReset().mockImplementation(async (_client: unknown, _table: string, _columns: unknown, filters: { workspace_id: number }) => ({
            data: mocks.memberOf.has(filters.workspace_id) ? { workspace_id: filters.workspace_id } : null,
        }))
    })

    it('follows the stored workspace when the request names none, once the membership confirms it', async () => {
        const session = await getServerSession()
        expect(session.user?.workspace_id).toBe(1)
        expect(session.workspace?.id).toBe(1)
        expect(session.workspaceRefused).toBe(false)
        expect(mocks.selectMaybeSingle).toHaveBeenCalledTimes(1)
        expect(mocks.selectMaybeSingle.mock.calls[0][3]).toEqual({ user_id: 'u1', workspace_id: 1 })
    })

    it('refuses a stored workspace the caller is not a member of', async () => {
        mocks.memberOf = new Set([2])
        const session = await getServerSession()
        expect(session.workspaceRefused).toBe(true)
        expect(session.user).toBeNull()
        expect(session.workspace).toBeNull()
    })

    it('switches to a workspace the caller belongs to', async () => {
        mocks.requestedWorkspaceId = 2
        const session = await getServerSession()
        expect(session.user?.workspace_id).toBe(2)
        expect(session.workspace?.id).toBe(2)
        expect(session.workspaceRefused).toBe(false)
    })

    it('refuses a workspace the caller does not belong to', async () => {
        mocks.requestedWorkspaceId = 3
        const session = await getServerSession()
        expect(session.workspaceRefused).toBe(true)
        expect(session.user).toBeNull()
        expect(session.workspace).toBeNull()
    })

    it('refuses a malformed workspace id without querying it', async () => {
        mocks.requestedWorkspaceId = Number.NaN
        const session = await getServerSession()
        expect(session.workspaceRefused).toBe(true)
        expect(mocks.selectMaybeSingle).not.toHaveBeenCalled()
    })
})
