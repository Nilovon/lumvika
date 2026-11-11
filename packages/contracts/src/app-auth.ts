import { z } from 'zod'

// Sign-in from the iOS app. The hub answers a refusal with `error` to show and `reason` to count.

// The channels a message reaches a phone by, for the WhatsApp features.
export const phoneChannelSchema = z.enum(['sms', 'whatsapp'])
export type PhoneChannel = z.infer<typeof phoneChannelSchema>

export const emailCodeRequestSchema = z.object({ email: z.string().trim().email().max(320) })

// The hub opens the account of a new address and answers `mailed: false`: the app then asks the auth
// server for the code itself. Whether the address had an account is not said here: that would tell
// anyone who holds one, before any code is checked.
export const emailCodePreparedSchema = z.object({ mailed: z.boolean() })

export const signInRefusalSchema = z.object({
    error: z.string(),
    reason: z.string(),
    retryAfterSeconds: z.number().optional(),
})
export type SignInRefusal = z.infer<typeof signInRefusalSchema>

export const accountDeletionStatusSchema = z.object({
    blockers: z.array(z.object({ workspaceId: z.number(), name: z.string() })),
})

export const deleteAccountRequestSchema = z.object({ confirmation: z.literal('DELETE') })

// Deleting the account needs a sign-in this recent: a stolen token alone does not destroy anything.
export const ACCOUNT_DELETION_REAUTH_MS = 10 * 60_000
export const REAUTH_REQUIRED = 'reauth_required'
