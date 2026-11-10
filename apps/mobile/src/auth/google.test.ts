import { signInWithGoogle } from '@/auth/google'
import { SignInError } from '@/auth/sign-in'

const mockSignIn = jest.fn()
jest.mock('@react-native-google-signin/google-signin', () => ({
    GoogleSignin: { configure: jest.fn(), signIn: (...args: unknown[]) => mockSignIn(...args), signOut: jest.fn().mockResolvedValue(null) },
    isSuccessResponse: (response: { type: string }) => response.type === 'success',
    isErrorWithCode: (error: unknown) => typeof error === 'object' && error !== null && 'code' in error,
    statusCodes: { IN_PROGRESS: 'IN_PROGRESS' },
}))
const mockSignInWithIdToken = jest.fn()
jest.mock('@/auth/supabase', () => ({ supabase: { auth: { signInWithIdToken: (...args: unknown[]) => mockSignInWithIdToken(...args) } } }))
jest.mock('@/api/client', () => ({ api: jest.fn(), ApiError: class extends Error {} }))

describe('signInWithGoogle', () => {
    beforeEach(() => {
        mockSignIn.mockReset()
        mockSignInWithIdToken.mockReset()
        mockSignInWithIdToken.mockResolvedValue({ error: null })
    })

    it('opens the Supabase session with the token Google handed back', async () => {
        mockSignIn.mockResolvedValue({ type: 'success', data: { idToken: 'google-jwt' } })
        await expect(signInWithGoogle()).resolves.toBe(true)
        expect(mockSignInWithIdToken).toHaveBeenCalledWith({ provider: 'google', token: 'google-jwt' })
    })

    it('does nothing when the Google sheet is closed', async () => {
        mockSignIn.mockResolvedValue({ type: 'cancelled', data: null })
        await expect(signInWithGoogle()).resolves.toBe(false)
        expect(mockSignInWithIdToken).not.toHaveBeenCalled()
    })

    it('shows one message whether Google or Supabase refused', async () => {
        mockSignIn.mockRejectedValue({ code: 'SIGN_IN_FAILED' })
        await expect(signInWithGoogle()).rejects.toBeInstanceOf(SignInError)

        mockSignIn.mockResolvedValue({ type: 'success', data: { idToken: 'google-jwt' } })
        mockSignInWithIdToken.mockResolvedValue({ error: { message: 'audience mismatch' } })
        await expect(signInWithGoogle()).rejects.toMatchObject({ reason: 'google' })
    })
})
