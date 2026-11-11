'use server'

import { claimEmailCodeAsk, ensureEmailAccount, lookupEmailForSignUp } from '@/app/api/_services/email-sign-up.service'
import { provisionUser } from '@/app/api/_services/user-provisioning.service'
import { getAuth } from '@/lib/auth/auth'
import { callerIp } from '@/lib/auth/caller-ip'
import { EMAIL_PREPARATION_CODES, type EmailPreparationFailure } from '@/lib/auth/email-sign-in-messages'
import { failure, type ActionFailure } from '@/lib/i18n/action-error'
import { verifyCaptcha } from '@/lib/auth/captcha'
import { captchaProofSchema, type CaptchaProof } from '@/lib/auth/captcha-proof'
import { userScope } from '@/lib/db'
import { drawPriceArm } from '@lumvika/cloud/billing'
import { normalizeEmail } from '@/lib/email'
import { realEmail } from '@/lib/auth/placeholder-email'
import { EXPERIMENT_COOKIE } from '@lumvika/analytics/experiments'
import { CONSENT_COOKIE } from '@lumvika/contracts'
import { LOCALE_COOKIE, resolveLocale } from '@lumvika/i18n'
import { cookies, headers } from 'next/headers'
import { z } from 'zod'

// An address on one of the reserved domains (anonymous visitors, deleted accounts) is never a real one.
const prepareSchema = z.object({ email: z.string().trim().email().max(320).refine(email => !!realEmail(normalizeEmail(email))), captcha: captchaProofSchema.optional() })

export type EmailSignInPreparation = { ok: true; created: boolean } | (ActionFailure & { reason: EmailPreparationFailure })

const preparationRefused = (reason: EmailPreparationFailure) => ({ ...failure(EMAIL_PREPARATION_CODES[reason]), reason })

// What every ask for a code goes through before the auth layer hears of it: the robot check, then the
// pace of the network behind the caller. `null` when the caller may go on.
async function refuseCodeAsk(captcha: CaptchaProof | undefined): Promise<{ ip: string; refusal: EmailPreparationFailure | null }> {
    const ip = callerIp(await headers())
    if (!(await verifyCaptcha(captcha, ip))) return { ip, refusal: 'captcha_failed' }
    if (!(await claimEmailCodeAsk(ip))) return { ip, refusal: 'too_many_codes' }
    return { ip, refusal: null }
}

// Called before the auth page asks for a sign-in code, which is only ever mailed to an account that
// exists: a new address gets its account here first.
export async function prepareEmailSignIn(input: z.input<typeof prepareSchema>): Promise<EmailSignInPreparation> {
    const parsed = prepareSchema.safeParse(input)
    if (!parsed.success) return preparationRefused('invalid_email')

    const { ip, refusal } = await refuseCodeAsk(parsed.data.captcha)
    if (refusal) return preparationRefused(refusal)

    const result = await ensureEmailAccount(normalizeEmail(parsed.data.email), ip)
    return result.ok ? result : preparationRefused(result.error)
}

export type AnonymousEmailPreparation = { ok: true; exists: boolean } | (ActionFailure & { reason: EmailPreparationFailure })

// The address an anonymous visitor claims goes through the same gate as the auth page's, and the
// domain rule with it. Whether the address has an account is what the visitor's browser needs next:
// a known one is signed into, a new one is claimed on the anonymous user. It is only said past the
// robot check and the pace, like `created` above.
export async function prepareAnonymousEmailStep(input: z.input<typeof prepareSchema>): Promise<AnonymousEmailPreparation> {
    const parsed = prepareSchema.safeParse(input)
    if (!parsed.success) return preparationRefused('invalid_email')

    const { refusal } = await refuseCodeAsk(parsed.data.captcha)
    if (refusal) return preparationRefused(refusal)

    const lookup = await lookupEmailForSignUp(normalizeEmail(parsed.data.email))
    return lookup.ok ? lookup : preparationRefused(lookup.error)
}

export type SignupCompletion = { ok: true; signedUp: boolean } | { ok: false }

// The browser converts the anonymous session on its own, and the server stamps the signup on
// whichever request comes next. This is that request, made so the signup form can wait for the
// stamp instead of leaving the tab to learn it from realtime. Same inputs as the middleware's
// provisioning. The session is read past its cached copy, which still says anonymous for a few
// minutes after the address was claimed.
export async function completeSignupAction(): Promise<SignupCompletion> {
    const requestHeaders = await headers()
    const session = await getAuth().api.getSession({ headers: requestHeaders, query: { disableCookieCache: true } })
    const user = session?.user as (NonNullable<typeof session>['user'] & { isAnonymous?: boolean | null }) | undefined
    if (!user || user.isAnonymous) return { ok: false }
    const cookieStore = await cookies()
    const provisioned = await provisionUser(userScope(user.id), { id: user.id, isAnonymous: false }, {
        priceArm: drawPriceArm({
            experimentCookie: cookieStore.get(EXPERIMENT_COOKIE)?.value,
            consentCookie: cookieStore.get(CONSENT_COOKIE)?.value,
            userAgent: requestHeaders.get('user-agent'),
        }),
        locale: resolveLocale({ cookie: cookieStore.get(LOCALE_COOKIE)?.value, acceptLanguage: requestHeaders.get('accept-language') }),
    })
    return provisioned ? { ok: true, signedUp: provisioned.signedUp } : { ok: false }
}
