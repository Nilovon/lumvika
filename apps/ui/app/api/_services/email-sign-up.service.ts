import 'server-only'
import { callerRateKey } from '@/lib/auth/caller-ip'
import { callScalar, findAuthUserIdByEmail, serviceScope } from '@/lib/db'
import { authUsers } from '@lumvika/db/schema'

// Only creations are counted here, and an office rarely opens ten accounts in the same hour.
export const MAX_SIGN_UPS_PER_IP = 10
const SIGN_UP_WINDOW_SECONDS = 60 * 60
// Every ask for a code counts too, not only the creations: the route is public and answers whether a
// code is on its way, so a loop over addresses runs out here first.
export const MAX_CODE_ASKS_PER_IP = 30
// Every auth email counts against its address too, whichever path asked for it: an attacker who talks
// to the auth endpoints directly skips the captcha and the per-network pace, not this.
export const MAX_AUTH_EMAILS_PER_ADDRESS = 10

async function claim(key: string, max: number): Promise<{ claimed: boolean; failed: boolean }> {
    const { data, error } = await callScalar<boolean>(serviceScope(), 'claim_email_sign_up', { p_ip: key, p_ip_max: max, p_window_seconds: SIGN_UP_WINDOW_SECONDS })
    if (error) console.error('[email-sign-up] claim_email_sign_up failed', error.message)
    return { claimed: !error && data === true, failed: !!error }
}

// Counted under its own scope of the sign-up window. False once the caller asked too often.
export async function claimEmailCodeAsk(ip: string): Promise<boolean> {
    return (await claim(`code:${callerRateKey(ip)}`, MAX_CODE_ASKS_PER_IP)).claimed
}

// Counted per address. A counter that cannot be read lets the email through: an outage of the
// database must not lock every sign-in out.
export async function claimAuthEmailSend(email: string): Promise<boolean> {
    const { claimed, failed } = await claim(`mail:${email}`, MAX_AUTH_EMAILS_PER_ADDRESS)
    return claimed || failed
}

export type EmailAccountFailure = 'blocked_domain' | 'too_many' | 'unavailable'
// `created` is whether this call opened the account: the address is new, and the sign-in about to
// follow is a signup.
export type EmailAccountResult = { ok: true; created: boolean } | { ok: false; error: EmailAccountFailure }

const refused = (error: EmailAccountFailure) => ({ ok: false as const, error })

export type EmailLookupResult = { ok: true; exists: boolean } | { ok: false; error: EmailAccountFailure }

// Whether the address has an account, and when it has none, whether one may open on its domain.
// An anonymous visitor claiming the address goes through an update, never a creation, so the domain
// rule is asked here as well as in the auth layer's hooks.
export async function lookupEmailForSignUp(email: string): Promise<EmailLookupResult> {
    try {
        if (await findAuthUserIdByEmail(email)) return { ok: true, exists: true }
    } catch (error) {
        console.error('[email-sign-up] account lookup failed', error instanceof Error ? error.message : error)
        return refused('unavailable')
    }

    const { data: blocked, error: blockedError } = await callScalar<boolean>(serviceScope(), 'email_domain_is_blocked', { p_email: email })
    if (blockedError) {
        console.error('[email-sign-up] email_domain_is_blocked failed', blockedError.message)
        return refused('unavailable')
    }
    if (blocked) return refused('blocked_domain')
    return { ok: true, exists: false }
}

// The per-network cap on accounts born from an address, asked once the address is known to be new.
export async function claimEmailSignUp(ip: string): Promise<{ ok: true } | { ok: false; error: EmailAccountFailure }> {
    const { claimed, failed } = await claim(callerRateKey(ip), MAX_SIGN_UPS_PER_IP)
    if (failed) return refused('unavailable')
    return claimed ? { ok: true } : refused('too_many')
}

// The app has no anonymous session to claim an address on: an address with no account gets one
// before its first code is asked for, so the code signs into it. Left unverified, the code is what
// proves the address, and no password exists on it. `email` is normalized already.
export async function ensureEmailAccount(email: string, ip: string): Promise<EmailAccountResult> {
    const lookup = await lookupEmailForSignUp(email)
    if (!lookup.ok) return lookup
    if (lookup.exists) return { ok: true, created: false }

    const claimed = await claimEmailSignUp(ip)
    if (!claimed.ok) return claimed

    try {
        // Another tab of the same visitor may have created it a moment earlier, and counts it there.
        const created = await serviceScope().run(db => db.insert(authUsers).values({ id: crypto.randomUUID(), name: '', email, emailVerified: false }).onConflictDoNothing().returning({ id: authUsers.id }))
        return { ok: true, created: created.length > 0 }
    } catch (error) {
        console.error('[email-sign-up] account creation failed', error instanceof Error ? error.message : error)
        return refused('unavailable')
    }
}
