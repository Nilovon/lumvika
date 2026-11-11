import { claimEmailCodeAsk, ensureEmailAccount } from '@/app/api/_services/email-sign-up.service'
import { emailRefused } from '@/app/api/v1/auth/_lib/refusal'
import { apiRoute } from '@/app/api/v1/_lib/api-route'
import { callerIp } from '@/lib/auth/caller-ip'
import { normalizeEmail } from '@/lib/email'
import { realEmail } from '@/lib/auth/placeholder-email'
import { emailCodeRequestSchema } from '@lumvika/contracts'

export const dynamic = 'force-dynamic'

// Same gate as the web: the pace of the network, then the account of a new address, since a code alone
// never creates one. The app then asks the auth server for the code itself (/api/auth/email-otp/*).
// Whether the address was new stays here: said back, it would tell anyone who holds an account.
export const POST = apiRoute({ auth: 'public', body: emailCodeRequestSchema }, async ({ req, body }) => {
    const ip = callerIp(req.headers)
    if (!(await claimEmailCodeAsk(ip))) return emailRefused('too_many')

    const email = normalizeEmail(body.email)
    if (!realEmail(email)) return emailRefused('invalid_email')
    const result = await ensureEmailAccount(email, ip)
    if (!result.ok) return emailRefused(result.error)
    return { mailed: false }
})
