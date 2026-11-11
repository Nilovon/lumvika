import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = await vi.hoisted(async () => (await import('@/test/db-fake')).fakeDb())
vi.mock('@/lib/db', async importOriginal => ({ ...(await importOriginal<object>()), ...db.helpers }))

let holder: { user_id: string; revoked_at: string | null; last_seen_at: string } | null = null

let user: { id: string; isAnonymous: boolean } | null = { id: 'user-1', isAnonymous: false }
vi.mock('@/lib/auth/session/getServerSession', () => ({
    getAuthUser: async () => (user ? { id: user.id, email: null, name: '', image: null, isAnonymous: user.isAnonymous } : null),
}))
vi.mock('@/lib/auth/session/request', () => ({ getRequestScope: async () => ({ kind: 'user', userId: user?.id ?? null }) }))

const writes = () => [...db.callsTo('upsertRows', 'device_tokens'), ...db.callsTo('updateRows', 'device_tokens')]

const { POST, DELETE } = await import('./route')

const segment = { params: Promise.resolve({}) }
const url = 'https://app.lumvika.com/api/v1/me/devices'
const call = (handler: typeof POST, body: object) => handler(new Request(url, { method: 'POST', body: JSON.stringify(body) }), segment)
const TOKEN = 'ExponentPushToken[a-b_c]'
const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60_000).toISOString()

describe('/api/v1/me/devices', () => {
    beforeEach(() => {
        user = { id: 'user-1', isAnonymous: false }
        holder = null
        db.reset()
        db.answer(call => (call.helper === 'selectMaybeSingle' && call.table === 'device_tokens' ? { data: holder } : undefined))
    })

    it('registers the token of the caller, and wakes a revoked one of theirs', async () => {
        holder = { user_id: 'user-1', revoked_at: daysAgo(1), last_seen_at: daysAgo(1) }
        expect((await call(POST, { token: TOKEN, platform: 'ios', appVersion: '1.0.0 (7)' })).status).toBe(204)
        const [write] = writes()
        expect(write.helper).toBe('upsertRows')
        expect(write.scope.kind).toBe('service')
        expect(write.args[0]).toMatchObject({ user_id: 'user-1', token: TOKEN, platform: 'ios', app_version: '1.0.0 (7)', revoked_at: null })
        expect(write.args[1]).toEqual({ onConflict: ['token'] })
    })

    it('moves a token to the new account of the phone once the previous one signed out or went quiet', async () => {
        holder = { user_id: 'user-2', revoked_at: daysAgo(2), last_seen_at: daysAgo(2) }
        expect((await call(POST, { token: TOKEN, platform: 'ios' })).status).toBe(204)
        holder = { user_id: 'user-2', revoked_at: null, last_seen_at: daysAgo(45) }
        expect((await call(POST, { token: TOKEN, platform: 'ios' })).status).toBe(204)
        expect(writes()).toHaveLength(2)
    })

    it('leaves a token another account still uses to that account', async () => {
        holder = { user_id: 'user-2', revoked_at: null, last_seen_at: daysAgo(3) }
        const res = await call(POST, { token: TOKEN, platform: 'ios' })
        expect(res.status).toBe(409)
        expect(await res.json()).toMatchObject({ error: 'This device is registered to another account.' })
        expect(writes()).toHaveLength(0)
    })

    it('revokes only the caller’s own token on sign-out', async () => {
        expect((await call(DELETE, { token: TOKEN, platform: 'ios' })).status).toBe(204)
        const [write] = writes()
        expect(write.helper).toBe('updateRows')
        expect(write.args[1]).toEqual({ token: TOKEN, user_id: 'user-1' })
    })

    it('refuses an empty token, one that is not an Expo token, and a signed-out caller', async () => {
        expect((await call(POST, { token: ' ', platform: 'ios' })).status).toBe(400)
        expect((await call(POST, { token: 'anything-at-all', platform: 'ios' })).status).toBe(400)
        user = null
        expect((await call(POST, { token: TOKEN, platform: 'ios' })).status).toBe(401)
        expect(writes()).toHaveLength(0)
    })
})
