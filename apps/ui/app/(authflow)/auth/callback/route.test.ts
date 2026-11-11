import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const db = await vi.hoisted(async () => (await import('@/test/db-fake')).fakeDb())
vi.mock('@/lib/db', async importOriginal => ({ ...(await importOriginal<object>()), ...db.helpers }))

const auth = vi.hoisted(() => ({ getSession: vi.fn(), signInSocial: vi.fn(), claimProviderEmail: vi.fn() }))
vi.mock('@/lib/auth/auth', () => ({ getAuth: () => ({ api: { getSession: auth.getSession, signInSocial: auth.signInSocial } }) }))
vi.mock('@/lib/auth/provider-email', () => ({ claimProviderEmail: auth.claimProviderEmail }))

let requestCookies = new Map<string, string>()
vi.mock('next/headers', () => ({
    cookies: async () => ({
        get: (name: string) => (requestCookies.has(name) ? { name, value: requestCookies.get(name) } : undefined),
        has: (name: string) => requestCookies.has(name),
        getAll: () => [...requestCookies].map(([name, value]) => ({ name, value })),
    }),
}))

const { GET } = await import('./route')

const callback = (query = '') => GET(new Request(`https://app.lumvika.com/auth/callback${query}`))

const NOW = new Date('2026-10-16T10:30:00.000Z')
const TAKEN = '?error=account_already_linked_to_different_user'

const signedUpAt = (stamp: string | null) => db.answer(call => (call.helper === 'selectMaybeSingle' && call.table === 'users' ? { data: stamp ? { signed_up_at: stamp } : null } : undefined))

beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    requestCookies = new Map()
    db.reset()
    auth.getSession.mockReset().mockImplementation(async ({ returnHeaders }: { returnHeaders?: boolean }) => {
        const session = { user: { id: 'user-1', isAnonymous: false }, session: {} }
        return returnHeaders ? { headers: new Headers([['set-cookie', 'lumvika.session_data=fresh; Path=/']]), response: session } : session
    })
    auth.claimProviderEmail.mockReset().mockResolvedValue('claimed')
    auth.signInSocial.mockReset().mockResolvedValue({ headers: new Headers([['set-cookie', 'lumvika.state=abc; Path=/']]), response: { url: 'https://accounts.google.com/o/oauth2/auth?state=abc', redirect: false } })
})

afterEach(() => {
    vi.useRealTimers()
})

const anonymousVisitor = () =>
    auth.getSession.mockImplementation(async ({ returnHeaders }: { returnHeaders?: boolean }) => {
        const session = { user: { id: 'visitor-1', isAnonymous: true }, session: {} }
        return returnHeaders ? { headers: new Headers([['set-cookie', 'lumvika.session_data=fresh; Path=/']]), response: session } : session
    })

describe('GET /auth/callback', () => {
    it('sends a sign-in home', async () => {
        const response = await callback()

        expect(response.headers.get('location')).toBe('https://app.lumvika.com/')
    })

    it('sends a sign-in that came from an invitation back to it', async () => {
        requestCookies.set('pending_invite', '/invite/token-1')

        const response = await callback()

        expect(response.headers.get('location')).toBe('https://app.lumvika.com/invite/token-1')
    })

    it('remembers Google as the last way in', async () => {
        requestCookies.set('rr_oauth_provider', 'google')

        const response = await callback()

        expect(response.cookies.get('rr_last_sign_in')?.value).toBe('google')
    })

    it('remembers Apple as the last way in', async () => {
        requestCookies.set('rr_oauth_provider', 'apple')

        const response = await callback()

        expect(response.cookies.get('rr_last_sign_in')?.value).toBe('apple')
    })

    it('does not remember a provider connected from the account settings', async () => {
        requestCookies.set('rr_link_intent', 'apple')
        requestCookies.set('rr_oauth_provider', 'apple')

        const response = await callback()

        expect(response.cookies.get('rr_last_sign_in')).toBeUndefined()
    })

    it('does not remember a sign-in whose provider cookie is gone', async () => {
        const response = await callback()

        expect(response.cookies.get('rr_last_sign_in')).toBeUndefined()
    })

    it('does not remember a sign-in that failed', async () => {
        requestCookies.set('rr_oauth_provider', 'apple')

        const response = await callback('?error=access_denied')

        expect(response.cookies.get('rr_last_sign_in')).toBeUndefined()
    })

    it('sends a cancelled sign-in back to the board, which offers it again', async () => {
        const response = await callback('?error=access_denied')

        expect(response.headers.get('location')).toBe('https://app.lumvika.com/?error=access_denied&error_code=access_denied')
    })

    it('names a round trip that outlived its state the way the board reads it', async () => {
        const response = await callback('?error=state_mismatch')

        expect(response.headers.get('location')).toBe('https://app.lumvika.com/?error=bad_oauth_state&error_code=bad_oauth_state')
    })

    it('sends a failed sign-in to the public host when the request reached it through the proxy', async () => {
        const response = await GET(new Request('http://localhost:8080/auth/callback?error=access_denied', { headers: { 'x-forwarded-host': 'app.lumvika.com' } }))

        expect(response.headers.get('location')).toBe('https://app.lumvika.com/?error=access_denied&error_code=access_denied')
    })

    it('sends a return with no session behind it to the expired link page', async () => {
        auth.getSession.mockResolvedValue(null)

        const response = await callback()

        expect(response.headers.get('location')).toBe('https://app.lumvika.com/auth/auth-code-error')
    })

    it('turns a visitor who linked a provider into an account, and writes the session copy again', async () => {
        anonymousVisitor()

        const response = await callback()

        expect(auth.claimProviderEmail).toHaveBeenCalledWith('visitor-1')
        expect(response.headers.get('location')).toBe('https://app.lumvika.com/')
        expect(response.headers.getSetCookie()).toContain('lumvika.session_data=fresh; Path=/')
    })

    it('signs a visitor whose provider address already has an account into that account', async () => {
        anonymousVisitor()
        auth.claimProviderEmail.mockResolvedValue('taken')
        requestCookies.set('rr_oauth_provider', 'apple')

        const response = await callback()

        expect(auth.signInSocial).toHaveBeenCalledWith(expect.objectContaining({ body: expect.objectContaining({ provider: 'apple', callbackURL: '/auth/callback' }) }))
        expect(response.headers.get('location')).toBe('https://accounts.google.com/o/oauth2/auth?state=abc')
    })

    it('sends a visitor whose provider address could not be claimed to the expired link page', async () => {
        anonymousVisitor()
        auth.claimProviderEmail.mockResolvedValue('failed')

        const response = await callback()

        expect(response.headers.get('location')).toBe('https://app.lumvika.com/auth/auth-code-error')
    })

    it('signs a visitor into the account their Google identity already belongs to, carrying the state cookie', async () => {
        const response = await callback(TAKEN)

        expect(auth.signInSocial).toHaveBeenCalledWith(expect.objectContaining({ body: expect.objectContaining({ provider: 'google', disableRedirect: true }), returnHeaders: true }))
        expect(response.headers.get('location')).toBe('https://accounts.google.com/o/oauth2/auth?state=abc')
        expect(response.headers.getSetCookie()).toContain('lumvika.state=abc; Path=/')
    })

    it('signs a visitor into the account their Apple identity already belongs to', async () => {
        requestCookies.set('rr_oauth_provider', 'apple')

        await callback(TAKEN)

        expect(auth.signInSocial).toHaveBeenCalledWith(expect.objectContaining({ body: expect.objectContaining({ provider: 'apple' }) }))
    })

    it('restarts Google when the provider cookie holds something unknown', async () => {
        requestCookies.set('rr_oauth_provider', 'facebook')

        await callback(TAKEN)

        expect(auth.signInSocial).toHaveBeenCalledWith(expect.objectContaining({ body: expect.objectContaining({ provider: 'google' }) }))
    })

    it('sends a sign-in that could not be restarted to the expired link page', async () => {
        auth.signInSocial.mockRejectedValue(new Error('nope'))
        vi.spyOn(console, 'error').mockImplementation(() => {})

        const response = await callback(TAKEN)

        expect(response.headers.get('location')).toBe('https://app.lumvika.com/auth/auth-code-error')
    })

    it('brings a Google connection back to the account settings, and forgets the intent', async () => {
        requestCookies.set('rr_link_intent', 'google')

        const response = await callback()

        expect(response.headers.get('location')).toBe('https://app.lumvika.com/?account=sign-in')
        expect(response.cookies.get('rr_link_intent')?.value).toBe('')
        expect(auth.claimProviderEmail).not.toHaveBeenCalled()
    })

    it('brings a refused Google connection back with the reason', async () => {
        requestCookies.set('rr_link_intent', 'google')

        const response = await callback(TAKEN)

        expect(response.headers.get('location')).toBe('https://app.lumvika.com/?account=sign-in&link_error=account_already_linked_to_different_user&link_provider=google')
        expect(auth.signInSocial).not.toHaveBeenCalled()
    })

    it('names Apple when an Apple connection was refused', async () => {
        requestCookies.set('rr_link_intent', 'apple')

        const response = await callback('?error=access_denied')

        expect(response.headers.get('location')).toBe('https://app.lumvika.com/?account=sign-in&link_error=access_denied&link_provider=apple')
    })

    it('brings a Google connection that left no session back with a failure', async () => {
        requestCookies.set('rr_link_intent', 'google')
        auth.getSession.mockResolvedValue(null)

        const response = await callback()

        expect(response.headers.get('location')).toBe('https://app.lumvika.com/?account=sign-in&link_error=failed&link_provider=google')
    })

    it('forgets the signup intent of an account that was signed up before this sign-in', async () => {
        signedUpAt('2026-10-15T19:31:32Z')

        const response = await callback()

        expect(db.callsTo('selectMaybeSingle', 'users')[0].args).toEqual([['signed_up_at'], { id: 'user-1' }])
        const cleared = response.headers.getSetCookie().find(cookie => cookie.startsWith('rr_signup_intent='))
        expect(cleared).toMatch(/^rr_signup_intent=;/)
        expect(cleared).toContain('Max-Age=0')
        expect(cleared).toContain('Domain=.lumvika.com')
    })

    it('forgets the signup intent of an account signed up a few minutes before this sign-in', async () => {
        signedUpAt('2026-10-16T10:20:00.000Z')

        const response = await callback()

        expect(response.cookies.get('rr_signup_intent')?.value).toBe('')
    })

    it('keeps the signup intent of an account the middleware stamped ahead of the handler', async () => {
        signedUpAt('2026-10-16T10:29:59.700Z')

        const response = await callback()

        expect(response.cookies.get('rr_signup_intent')).toBeUndefined()
    })

    it('keeps the signup intent when the stamp is a minute old', async () => {
        signedUpAt('2026-10-16T10:29:00.000Z')

        const response = await callback()

        expect(response.cookies.get('rr_signup_intent')).toBeUndefined()
    })

    it('keeps the signup intent of an account that has no row yet', async () => {
        const response = await callback()

        expect(response.cookies.get('rr_signup_intent')).toBeUndefined()
    })

    it('leaves the signup intent alone when connecting Google from the settings', async () => {
        requestCookies.set('rr_link_intent', 'google')
        signedUpAt('2026-10-15T19:31:32Z')

        const response = await callback()

        expect(response.cookies.get('rr_signup_intent')).toBeUndefined()
    })
})
