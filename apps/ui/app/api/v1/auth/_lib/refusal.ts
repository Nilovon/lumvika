import { EMAIL_PREPARATION_MESSAGES, type EmailPreparationFailure } from '@/lib/auth/email-sign-in-messages'
import type { SignInRefusal } from '@lumvika/contracts'

const STATUS_BY_REASON: Partial<Record<EmailPreparationFailure, number>> = {
    too_many: 429,
    too_many_codes: 429,
    unavailable: 503,
    blocked_domain: 422,
}

export function emailRefused(reason: EmailPreparationFailure): Response {
    const body: SignInRefusal = { error: EMAIL_PREPARATION_MESSAGES[reason], reason }
    return Response.json(body, { status: STATUS_BY_REASON[reason] ?? 400 })
}
