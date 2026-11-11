import { ApiError } from '@/api/client'
import { sendEmailCode, signInWithEmail, SignInError } from '@/auth/sign-in'

const mockApi = jest.fn()
jest.mock('@/api/client', () => {
    const actual = jest.requireActual('@/api/client')
    return { ...actual, api: (...args: unknown[]) => mockApi(...args) }
})
const mockSendVerificationOtp = jest.fn()
const mockSignInEmailOtp = jest.fn()
jest.mock('@/auth/auth-client', () => ({
    authClient: {
        emailOtp: { sendVerificationOtp: (...args: unknown[]) => mockSendVerificationOtp(...args) },
        signIn: { emailOtp: (...args: unknown[]) => mockSignInEmailOtp(...args) },
    },
}))

describe('sign-in calls', () => {
    beforeEach(() => {
        mockApi.mockReset()
        mockSendVerificationOtp.mockReset().mockResolvedValue({ data: { success: true }, error: null })
        mockSignInEmailOtp.mockReset().mockResolvedValue({ data: {}, error: null })
    })

    it('asks for a code only when the hub did not mail one', async () => {
        mockApi.mockResolvedValue({ mailed: true })
        await sendEmailCode('ada@example.com')
        expect(mockApi).toHaveBeenCalledWith('/api/v1/auth/email/code', { method: 'POST', body: { email: 'ada@example.com' } })
        expect(mockSendVerificationOtp).not.toHaveBeenCalled()

        mockApi.mockResolvedValue({ mailed: false })
        await sendEmailCode('ada@example.com')
        expect(mockSendVerificationOtp).toHaveBeenCalledWith({ email: 'ada@example.com', type: 'sign-in' })
    })

    it('shows the message of a refusal of the hub', async () => {
        mockApi.mockRejectedValue(new ApiError(422, 'This email domain is not accepted.', { error: 'This email domain is not accepted.', reason: 'blocked_domain' }))
        await expect(sendEmailCode('ada@blocked.example')).rejects.toMatchObject({ message: 'This email domain is not accepted.', reason: 'blocked_domain', method: 'email' })
        expect(mockSendVerificationOtp).not.toHaveBeenCalled()
    })

    it('reads a failure without a refusal body as a connection problem', async () => {
        mockApi.mockRejectedValue(new TypeError('Network request failed'))
        await expect(sendEmailCode('ada@example.com')).rejects.toBeInstanceOf(SignInError)
        await expect(sendEmailCode('ada@example.com')).rejects.toMatchObject({ reason: 'network' })
    })

    it('tells too many codes apart from a code that could not be sent', async () => {
        mockApi.mockResolvedValue({ mailed: false })
        mockSendVerificationOtp.mockResolvedValue({ data: null, error: { status: 429, message: 'Too many requests' } })
        await expect(sendEmailCode('ada@example.com')).rejects.toMatchObject({ reason: 'rate_limited' })
        mockSendVerificationOtp.mockResolvedValue({ data: null, error: { status: 500, message: 'Failed' } })
        await expect(sendEmailCode('ada@example.com')).rejects.toMatchObject({ reason: 'unavailable' })
    })

    it('opens the session with the code typed', async () => {
        await signInWithEmail('ada@example.com', '123456')
        expect(mockSignInEmailOtp).toHaveBeenCalledWith({ email: 'ada@example.com', otp: '123456' })
    })

    it('reads a refused code as wrong or expired', async () => {
        mockSignInEmailOtp.mockResolvedValue({ data: null, error: { status: 400, code: 'INVALID_OTP', message: 'Invalid OTP' } })
        await expect(signInWithEmail('ada@example.com', '000000')).rejects.toMatchObject({ reason: 'wrong_code', method: 'email' })
    })
})
