import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const db = await vi.hoisted(async () => (await import('@/test/db-fake')).fakeDb())
vi.mock('@/lib/db', async importOriginal => ({ ...(await importOriginal<object>()), ...db.helpers }))

const mocks = vi.hoisted(() => ({ getServerSession: vi.fn() }))
const RECIPIENT = vi.hoisted(() => 'user-recipient')

vi.mock('@/lib/auth/session/getServerSession', () => ({ getServerSession: mocks.getServerSession, getSessionWorkspace: mocks.getServerSession }))
// The signature itself is tested with the token module: here a token is either the good one or not.
vi.mock('@lumvika/cloud/email', () => ({ verifyUnsubscribeToken: (token: string) => (token === `token-of-${RECIPIENT}` ? { userId: RECIPIENT, scope: null } : null) }))

const { updateNotificationPrefsAction, updateNotificationPrefsByTokenAction } = await import('./notifications.actions')

const SIGNED_IN = 'user-signed-in'

const writes = () => db.callsTo('updateRows', 'users').map(call => ({ payload: call.args[0], filters: call.args[1] }))

beforeEach(() => {
    vi.clearAllMocks()
    db.reset()
    db.answer(call => (call.table === 'users' && call.helper.startsWith('select') ? { data: { email_notification_prefs: { sound: true, categories: { billing: true, product: true } } } } : undefined))
    mocks.getServerSession.mockResolvedValue({ user: { id: SIGNED_IN } })
})

afterEach(() => vi.unstubAllEnvs())

describe('updateNotificationPrefsByTokenAction', () => {
    it('writes the merged preferences of the token user only, whoever is signed in', async () => {
        await expect(updateNotificationPrefsByTokenAction(`token-of-${RECIPIENT}`, { categories: { product: false } })).resolves.toEqual({ ok: true })

        const reads = db.calls.filter(call => call.table === 'users' && call.helper.startsWith('select'))
        expect(reads[0].args[1]).toEqual({ id: RECIPIENT })
        const [write] = writes()
        expect(write.filters).toEqual({ id: RECIPIENT })
        expect(write.payload).toMatchObject({ email_notification_prefs: { sound: true, categories: { billing: true, product: false } } })
        expect(mocks.getServerSession).not.toHaveBeenCalled()
    })

    it('refuses a tampered token without writing', async () => {
        const token = `token-of-${RECIPIENT}`

        await expect(updateNotificationPrefsByTokenAction(`${token}x`, { sound: false })).resolves.toEqual({ ok: false, error: 'Invalid or expired link', code: 'linkInvalidOrExpired' })
        expect(writes()).toHaveLength(0)
    })

    it('refuses a patch that does not match the preferences schema', async () => {
        await expect(updateNotificationPrefsByTokenAction(`token-of-${RECIPIENT}`, { sound: 'loud' } as never)).resolves.toEqual({ ok: false, error: 'Invalid preferences', code: 'invalidPreferences' })
        expect(writes()).toHaveLength(0)
    })
})

describe('updateNotificationPrefsAction', () => {
    it('writes the preferences of the signed-in user', async () => {
        await expect(updateNotificationPrefsAction({ sound: false })).resolves.toEqual({ ok: true })

        const [write] = writes()
        expect(write.filters).toEqual({ id: SIGNED_IN })
        expect(write.payload).toMatchObject({ email_notification_prefs: { sound: false } })
    })

    it('refuses a visitor who is not signed in', async () => {
        mocks.getServerSession.mockResolvedValue({ user: null })

        await expect(updateNotificationPrefsAction({ sound: false })).resolves.toEqual({ ok: false, error: 'Not authenticated', code: 'notAuthenticated' })
        expect(writes()).toHaveLength(0)
    })

    it('refuses an invalid patch before reading the session', async () => {
        await expect(updateNotificationPrefsAction({ scope: 'loud' } as never)).resolves.toEqual({ ok: false, error: 'Invalid preferences', code: 'invalidPreferences' })
        expect(mocks.getServerSession).not.toHaveBeenCalled()
    })
})
