import { signInWithGoogle } from '@/auth/google'
import { SignInError } from '@/auth/sign-in'

const mockSignInSocial = jest.fn()
const mockGetSession = jest.fn()
jest.mock('@/auth/auth-client', () => ({
    APP_SCHEME: 'lumvika',
    authClient: { signIn: { social: (...args: unknown[]) => mockSignInSocial(...args) }, getSession: (...args: unknown[]) => mockGetSession(...args) },
}))
jest.mock('@/api/client', () => ({ api: jest.fn(), ApiError: class extends Error {} }))

describe('signInWithGoogle', () => {
    beforeEach(() => {
        mockSignInSocial.mockReset().mockResolvedValue({ data: { url: 'https://accounts.google.com/o/oauth2/auth', redirect: true }, error: null })
        mockGetSession.mockReset().mockResolvedValue({ data: { session: { token: 't' }, user: { id: 'u1' } }, error: null })
    })

    it('opens Google in an auth session that comes back to the app', async () => {
        await expect(signInWithGoogle()).resolves.toBe(true)
        expect(mockSignInSocial).toHaveBeenCalledWith({ provider: 'google', callbackURL: 'lumvika://' })
    })

    it('does nothing when the Google page is closed without signing in', async () => {
        mockGetSession.mockResolvedValue({ data: null, error: null })
        await expect(signInWithGoogle()).resolves.toBe(false)
    })

    it('shows one message whether Google or the hub refused', async () => {
        mockSignInSocial.mockResolvedValue({ data: null, error: { status: 404, message: 'Provider not found' } })
        await expect(signInWithGoogle()).rejects.toBeInstanceOf(SignInError)
        await expect(signInWithGoogle()).rejects.toMatchObject({ reason: 'google' })
    })
})
