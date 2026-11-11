import { expo } from '@better-auth/expo'
import { callScalar, findAuthUserIdByEmail, getDb, serviceScope } from '@lumvika/db'
import { authAccounts, authRateLimits, authSessions, authUsers, authVerifications } from '@lumvika/db/schema'
import { betterAuth, type BetterAuthOptions } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { APIError } from 'better-auth/api'
import { nextCookies } from 'better-auth/next-js'
import { anonymous, bearer, emailOTP } from 'better-auth/plugins'

import { sendSignInCodeEmail } from '@/app/api/_services/email.service'
import { APP_URL } from '@/lib/app-url'
import { normalizeEmail } from '@/lib/email'
import { recipientLocale } from '@/lib/i18n/recipient-locale'

export const SIGN_IN_CODE_TTL_SECONDS = 15 * 60
export const ANONYMOUS_EMAIL_DOMAIN = 'anonymous.lumvika.invalid'
const MOBILE_SCHEME = 'lumvika://'

export function isAnonymousEmail(email: string | null | undefined): boolean {
    return !email || email.endsWith(`@${ANONYMOUS_EMAIL_DOMAIN}`)
}

async function refuseBlockedDomain(email: string) {
    if (isAnonymousEmail(email)) return
    const { data: blocked, error } = await callScalar<boolean>(serviceScope(), 'email_domain_is_blocked', { p_email: email })
    if (error) console.error('[auth] email_domain_is_blocked failed', error.message)
    if (blocked) throw new APIError('BAD_REQUEST', { message: 'This email domain is not accepted. Use another address.' })
}

// The language of the account the code is for; a visitor claiming a new address has none yet.
async function localeOfEmail(email: string) {
    const userId = await findAuthUserIdByEmail(email)
    return userId ? recipientLocale(serviceScope(), userId, null) : undefined
}

function socialProviders(): BetterAuthOptions['socialProviders'] {
    const providers: NonNullable<BetterAuthOptions['socialProviders']> = {}
    if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
        providers.google = { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET, prompt: 'consent', accessType: 'offline' }
    }
    if (process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET) {
        providers.apple = { clientId: process.env.APPLE_CLIENT_ID, clientSecret: process.env.APPLE_CLIENT_SECRET, appBundleIdentifier: process.env.APPLE_APP_BUNDLE_IDENTIFIER }
    }
    return providers
}

// `.lumvika.com` on Lumvika Cloud, so the landing reads the session hint; unset on a self-hosted install.
const COOKIE_DOMAIN = process.env.AUTH_COOKIE_DOMAIN

function createAuth() {
    return betterAuth({
        appName: 'Lumvika',
        baseURL: APP_URL,
        secret: process.env.BETTER_AUTH_SECRET,
        trustedOrigins: [APP_URL, MOBILE_SCHEME, ...(process.env.AUTH_TRUSTED_ORIGINS?.split(',').map(origin => origin.trim()) ?? [])],
        database: drizzleAdapter(getDb(), {
            provider: 'pg',
            schema: { user: authUsers, session: authSessions, account: authAccounts, verification: authVerifications, rateLimit: authRateLimits },
        }),
        advanced: {
            cookiePrefix: 'lumvika',
            database: { generateId: 'uuid' },
            ...(COOKIE_DOMAIN ? { crossSubDomainCookies: { enabled: true, domain: COOKIE_DOMAIN } } : {}),
        },
        session: {
            expiresIn: 60 * 60 * 24 * 400,
            updateAge: 60 * 60 * 24,
            // A page load re-reads the session from the database; everything in between trusts a
            // signed copy for five minutes, as the JWT did before.
            cookieCache: { enabled: true, maxAge: 5 * 60 },
        },
        rateLimit: { enabled: true, storage: 'database' },
        // Password sign-in serves the accounts app reviewers are given; nobody signs up with one.
        emailAndPassword: { enabled: true, disableSignUp: true },
        socialProviders: socialProviders(),
        account: {
            accountLinking: {
                enabled: true,
                trustedProviders: ['google', 'apple'],
                // An anonymous visitor linking Google takes Google's address in place of the placeholder.
                allowDifferentEmails: true,
                updateUserInfoOnLink: true,
            },
        },
        databaseHooks: {
            user: {
                create: {
                    before: async user => {
                        await refuseBlockedDomain(user.email)
                        return { data: { ...user, email: normalizeEmail(user.email) } }
                    },
                },
                update: {
                    // A visitor who claims an address, by code or through Google, stops being anonymous
                    // on the same id: the workspace they built stays theirs.
                    before: async user => {
                        if (typeof user.email !== 'string' || isAnonymousEmail(user.email)) return { data: user }
                        await refuseBlockedDomain(user.email)
                        return { data: { ...user, email: normalizeEmail(user.email), isAnonymous: false, emailVerified: true } }
                    },
                },
            },
        },
        plugins: [
            anonymous({
                emailDomainName: ANONYMOUS_EMAIL_DOMAIN,
                generateName: () => 'Anonymous',
                // An anonymous visitor who signs into an existing account leaves the throwaway one
                // behind; the purge task removes it with its workspace.
                disableDeleteAnonymousUser: true,
            }),
            emailOTP({
                otpLength: 6,
                expiresIn: SIGN_IN_CODE_TTL_SECONDS,
                allowedAttempts: 5,
                // A new address arrives through an anonymous session claiming it (changeEmail), never
                // through a sign-in that would mint a second user.
                disableSignUp: true,
                changeEmail: { enabled: true },
                async sendVerificationOTP({ email, otp }) {
                    const result = await sendSignInCodeEmail({ to: email, code: otp, expiresInMinutes: SIGN_IN_CODE_TTL_SECONDS / 60, locale: await localeOfEmail(email) })
                    if (!result.ok) console.error('[auth] could not send the sign-in code', result.error)
                },
            }),
            bearer(),
            expo(),
            nextCookies(),
        ],
    })
}

export type Auth = ReturnType<typeof createAuth>

const holder = globalThis as typeof globalThis & { __lumvikaAuth?: Auth }

export function getAuth(): Auth {
    holder.__lumvikaAuth ??= createAuth()
    return holder.__lumvikaAuth
}
