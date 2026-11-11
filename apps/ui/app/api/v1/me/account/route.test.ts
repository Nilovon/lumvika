import { beforeEach, describe, expect, it, vi } from 'vitest'

const accountDeletionBlockers = vi.fn()
const anonymizeAccount = vi.fn()
vi.mock('@/app/api/_services/account-deletion.service', () => ({
    accountDeletionBlockers: (...args: unknown[]) => accountDeletionBlockers(...args),
    anonymizeAccount: (...args: unknown[]) => anonymizeAccount(...args),
}))

type Caller = { id: string; isAnonymous: boolean; signedInAt?: string }
let user: Caller | null = { id: 'user-1', isAnonymous: false }
vi.mock('@/lib/auth/session/getServerSession', () => ({
    getAuthUser: async () => (user ? { id: user.id, email: null, name: '', image: null, isAnonymous: user.isAnonymous } : null),
}))
vi.mock('@/lib/auth/session/request', () => ({
    getRequestScope: async () => ({ kind: 'user', userId: user?.id ?? null }),
    getRequestAuth: async () => (user ? { user: { id: user.id }, session: { createdAt: user.signedInAt } } : null),
}))

const { GET, DELETE } = await import('./route')

const segment = { params: Promise.resolve({}) }
const url = 'https://app.lumvika.com/api/v1/me/account'
const BLOCKER = { workspaceId: 7, name: 'Acme' }

const remove = (body: object) => DELETE(new Request(url, { method: 'DELETE', body: JSON.stringify(body) }), segment)

describe('/api/v1/me/account', () => {
    beforeEach(() => {
        user = { id: 'user-1', isAnonymous: false, signedInAt: new Date(Date.now() - 60_000).toISOString() }
        accountDeletionBlockers.mockReset()
        anonymizeAccount.mockReset()
        accountDeletionBlockers.mockResolvedValue([])
        anonymizeAccount.mockResolvedValue({ ok: true })
    })

    it('lists what stands in the way of deleting the account', async () => {
        accountDeletionBlockers.mockResolvedValue([BLOCKER])
        expect(await (await GET(new Request(url), segment)).json()).toEqual({ blockers: [BLOCKER] })
        expect(accountDeletionBlockers).toHaveBeenCalledWith(expect.objectContaining({ kind: 'service' }), 'user-1')
    })

    it('deletes the account of the caller once DELETE is typed', async () => {
        expect((await remove({ confirmation: 'DELETE' })).status).toBe(204)
        expect(anonymizeAccount).toHaveBeenCalledWith(expect.objectContaining({ kind: 'service' }), 'user-1')
    })

    it('deletes nothing on a sign-in older than ten minutes, and says to sign in again', async () => {
        user = { id: 'user-1', isAnonymous: false, signedInAt: new Date(Date.now() - 11 * 60_000).toISOString() }
        const res = await remove({ confirmation: 'DELETE' })
        expect(res.status).toBe(403)
        expect(await res.json()).toEqual({ error: 'Sign in again to delete your account.', reason: 'reauth_required' })
        user = { id: 'user-1', isAnonymous: false }
        expect((await remove({ confirmation: 'DELETE' })).status).toBe(403)
        expect(anonymizeAccount).not.toHaveBeenCalled()
    })

    it('deletes nothing without the confirmation', async () => {
        expect((await remove({ confirmation: 'delete' })).status).toBe(400)
        expect(anonymizeAccount).not.toHaveBeenCalled()
    })

    it('names the workspace whose subscription still bills', async () => {
        anonymizeAccount.mockResolvedValue({ ok: false, blockers: [BLOCKER] })
        const res = await remove({ confirmation: 'DELETE' })
        expect(res.status).toBe(409)
        expect(await res.json()).toEqual({ error: 'Cancel the subscription of Acme first.', blockers: [BLOCKER] })
    })

    it('answers 401 to an anonymous visitor', async () => {
        user = { id: 'anon-1', isAnonymous: true }
        expect((await remove({ confirmation: 'DELETE' })).status).toBe(401)
        expect(anonymizeAccount).not.toHaveBeenCalled()
    })
})
