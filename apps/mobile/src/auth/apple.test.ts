import { signInWithApple } from '@/auth/apple'
import { SignInError } from '@/auth/sign-in'

const mockSignInAsync = jest.fn()
jest.mock('expo-apple-authentication', () => ({
    signInAsync: (...args: unknown[]) => mockSignInAsync(...args),
    AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}))
const mockSignInSocial = jest.fn()
jest.mock('@/auth/auth-client', () => ({ authClient: { signIn: { social: (...args: unknown[]) => mockSignInSocial(...args) } } }))
jest.mock('@/api/client', () => ({ api: jest.fn(), ApiError: class extends Error {} }))

describe('signInWithApple', () => {
    beforeEach(() => {
        mockSignInAsync.mockReset()
        mockSignInSocial.mockReset().mockResolvedValue({ data: {}, error: null })
    })

    it('opens the session with the identity token Apple handed back', async () => {
        mockSignInAsync.mockResolvedValue({ identityToken: 'apple-jwt', fullName: null })
        await expect(signInWithApple()).resolves.toBe(true)
        expect(mockSignInSocial).toHaveBeenCalledWith({ provider: 'apple', idToken: { token: 'apple-jwt', user: undefined } })
    })

    it('sends the name Apple gives on the first sign-in along with the token', async () => {
        mockSignInAsync.mockResolvedValue({ identityToken: 'apple-jwt', fullName: { givenName: 'Ada', familyName: 'Lovelace' } })
        await signInWithApple()
        expect(mockSignInSocial).toHaveBeenCalledWith({ provider: 'apple', idToken: { token: 'apple-jwt', user: { name: { firstName: 'Ada', lastName: 'Lovelace' } } } })
    })

    it('does nothing when the Apple sheet is closed', async () => {
        mockSignInAsync.mockRejectedValue({ code: 'ERR_REQUEST_CANCELED' })
        await expect(signInWithApple()).resolves.toBe(false)
        expect(mockSignInSocial).not.toHaveBeenCalled()
    })

    it('shows one message whether Apple or the hub refused', async () => {
        mockSignInAsync.mockResolvedValue({ identityToken: 'apple-jwt', fullName: null })
        mockSignInSocial.mockResolvedValue({ data: null, error: { status: 401, message: 'Invalid token' } })
        await expect(signInWithApple()).rejects.toBeInstanceOf(SignInError)
    })
})
