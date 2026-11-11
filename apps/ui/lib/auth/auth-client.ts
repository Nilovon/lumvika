'use client'

import { anonymousClient, emailOTPClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'

export const authClient = createAuthClient({
    plugins: [anonymousClient(), emailOTPClient()],
})

// A refusal from the auth endpoints. `code` is Better Auth's (`INVALID_OTP`, `OTP_EXPIRED`…), `status`
// the HTTP one, 429 when its rate limit holds the caller back.
export class AuthClientError extends Error {
    constructor(
        message: string,
        readonly code: string | undefined,
        readonly status: number
    ) {
        super(message)
        this.name = 'AuthClientError'
    }
}

type AuthReply<T> = { data: T; error: null } | { data: null; error: { message?: string; code?: string; status: number } }

export async function authCall<T>(reply: Promise<AuthReply<T>>): Promise<T> {
    const { data, error } = await reply
    if (error) throw new AuthClientError(error.message ?? 'Authentication failed', error.code, error.status)
    return data as T
}

const WRONG_CODE = new Set(['INVALID_OTP', 'OTP_EXPIRED', 'TOO_MANY_ATTEMPTS'])

// A wrong code, an expired one and one tried too often all read the same to the person typing it.
export const isWrongCode = (error: unknown) => error instanceof AuthClientError && !!error.code && WRONG_CODE.has(error.code)

export const isRateLimited = (error: unknown) => error instanceof AuthClientError && error.status === 429
