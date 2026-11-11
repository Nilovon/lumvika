import { emailCodePreparedSchema, meSchema, signInRefusalSchema, type Me } from '@lumvika/contracts'

import { api, ApiError } from '@/api/client'
import { authClient } from '@/auth/auth-client'

export const CODE_LENGTH = 6

export type CodeMethod = 'email'

// `reason` (with the `method` the code went by) picks the sentence the screen shows in the app's
// language; `message` is the English one, shown as it is for a reason the app does not know yet.
export class SignInError extends Error {
    constructor(
        message: string,
        readonly reason: string,
        readonly retryAfterSeconds?: number,
        readonly method?: CodeMethod
    ) {
        super(message)
        this.name = 'SignInError'
    }
}

const OFFLINE = new SignInError('We could not reach Lumvika. Check your connection and try again.', 'network')

const TOO_MANY_REQUESTS = 429

async function prepareEmailCode(email: string): Promise<boolean> {
    try {
        return emailCodePreparedSchema.parse(await api('/api/v1/auth/email/code', { method: 'POST', body: { email } })).mailed
    } catch (error) {
        const refusal = error instanceof ApiError ? signInRefusalSchema.safeParse(error.body) : null
        if (refusal?.success) throw new SignInError(refusal.data.error, refusal.data.reason, refusal.data.retryAfterSeconds, 'email')
        throw OFFLINE
    }
}

// The hub opens the account of a new address first, since a code alone never creates one, and may
// mail the code itself; otherwise the code is asked of the auth server.
export async function sendEmailCode(email: string): Promise<void> {
    if (await prepareEmailCode(email)) return
    const { error } = await authClient.emailOtp.sendVerificationOtp({ email, type: 'sign-in' })
    if (error?.status === TOO_MANY_REQUESTS) throw new SignInError('Too many codes asked for this address. Try again later.', 'rate_limited', undefined, 'email')
    if (error) throw new SignInError('We could not send your code. Try again.', 'unavailable', undefined, 'email')
}

export async function signInWithEmail(email: string, code: string): Promise<void> {
    const { error } = await authClient.signIn.emailOtp({ email, otp: code })
    if (error?.status === TOO_MANY_REQUESTS) throw new SignInError('Too many codes asked for this address. Try again later.', 'rate_limited', undefined, 'email')
    if (error) throw new SignInError('This code is wrong or has expired.', 'wrong_code', undefined, 'email')
}

export async function bootstrap(accessToken: string): Promise<Me> {
    return meSchema.parse(await api('/api/v1/bootstrap', { method: 'POST', accessToken }))
}
