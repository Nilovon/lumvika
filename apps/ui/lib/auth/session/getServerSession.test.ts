import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fakeScope } from '@/test/db-fake'

const db = await vi.hoisted(async () => (await import('@/test/db-fake')).fakeDb())
const mocks = vi.hoisted(() => ({ requestedWorkspaceId: null as number | null, memberOf: new Set<number>() }))

vi.mock('server-only', () => ({}))
vi.mock('react', () => ({ cache: <T>(fn: T) => fn }))
vi.mock('@/lib/db', async importOriginal => ({ ...(await importOriginal<object>()), ...db.helpers }))
vi.mock('@/lib/auth/auth', () => ({ isAnonymousEmail: (email: string | null) => !email || email.endsWith('@anonymous.lumvika.invalid') }))
vi.mock('./request', () => ({
    getRequestAuth: async () => ({ user: { id: 'u1', email: 'ada@lumvika.com', name: 'Ada', image: null, isAnonymous: false }, session: {} }),
    getRequestScope: async () => fakeScope('user', 'u1'),
    getRequestWorkspaceId: async () => mocks.requestedWorkspaceId,
}))

const { getServerSession } = await import('./getServerSession')

const membershipReads = () => db.callsTo('selectMaybeSingle', 'workspace_members')

describe('getServerSession', () => {
    beforeEach(() => {
        db.reset()
        mocks.requestedWorkspaceId = null
        mocks.memberOf = new Set([1, 2])
        db.answer(call => {
            const filters = call.args[1] as { id?: number; workspace_id?: number }
            if (call.table === 'users') return { data: { id: 'u1', workspace_id: 1, email_notification_prefs: null, locale: null } }
            if (call.table === 'workspace_members') return { data: mocks.memberOf.has(filters.workspace_id!) ? { workspace_id: filters.workspace_id, role: 'admin', box_scope: 'all' } : null }
            if (call.table === 'workspaces') return { data: { id: filters.id, name: `ws ${filters.id}` } }
            return undefined
        })
    })

    it('follows the stored workspace when the request names none, once the membership confirms it', async () => {
        const session = await getServerSession()
        expect(session.user?.workspace_id).toBe(1)
        expect(session.workspace?.id).toBe(1)
        expect(session.workspaceRefused).toBe(false)
        expect(session.session).toEqual({ id: 'u1', email: 'ada@lumvika.com', name: 'Ada', image: null, isAnonymous: false })
        expect(membershipReads()).toHaveLength(1)
        expect(membershipReads()[0].args[1]).toEqual({ user_id: 'u1', workspace_id: 1 })
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
        expect(membershipReads()).toEqual([])
    })
})
