'use server'

import { cookies, headers } from 'next/headers'

import { AuthorizationError } from '@/app/api/_auth/ownership'
import { accountDeletionBlockers, anonymizeAccount } from '@/app/api/_services/account-deletion.service'
import { syncStripeCustomerEmail } from '@lumvika/cloud/billing.server'
import { getAuth } from '@/lib/auth/auth'
import { DELETE_ACCOUNT_CONFIRMATION, type AccountDeletionBlocker } from '@/lib/auth/account-deletion'
import { OAUTH_PROVIDERS, isOAuthProvider, type OAuthProvider } from '@/lib/auth/oauth-providers'
import { realEmail } from '@/lib/auth/placeholder-email'
import { providerAccountsOf } from '@/lib/auth/provider-email'
import { getAuthUser, type AuthUser } from '@/lib/auth/session/getServerSession'
import { PROFILE_NAME_MAX } from '@/lib/auth/user-profile'
import { and, eq, findAuthUserIdByEmail, selectMany, serviceScope, updateRows } from '@/lib/db'
import { normalizeEmail } from '@/lib/email'
import { uploadPublicImage } from '@/lib/images/upload'
import { authAccounts } from '@lumvika/db/schema'
import { isStableLocale, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, PSEUDO_LOCALE, type Locale } from '@lumvika/i18n'
import { failure, failureOf } from '@/lib/i18n/action-error'
import type { ActionResult } from './space.actions'

const AVATAR_MAX_SIZE = 512
const AVATAR_MAX_BYTES = 8 * 1024 * 1024

async function requireAccount(): Promise<AuthUser> {
    const account = await getAuthUser()
    if (!account || account.isAnonymous) throw new AuthorizationError('signInToEditAccount')
    return account
}

// Written through the auth layer, which writes the session's signed copy again with it: the next
// read of the session in this tab already holds the new name or photo.
async function writeProfile(profile: { name?: string; image?: string | null }) {
    await getAuth().api.updateUser({ headers: await headers(), body: profile })
}

export async function updateMyNameAction(params: { name: string }): Promise<ActionResult> {
    try {
        await requireAccount()
        const name = params.name.trim().replace(/\s+/g, ' ')
        if (!name) return failure('nameRequired')
        if (name.length > PROFILE_NAME_MAX) return failure('keepItUnder', { max: PROFILE_NAME_MAX })

        await writeProfile({ name })
        return { ok: true }
    } catch (err) {
        return failureOf(err, 'saveNameFailed')
    }
}

// Saved on the account for the emails and notifications it receives, and mirrored in a cookie so
// this device reads it without a query. The cookie sits on `.lumvika.com`, where the landing reads it
// too. `null` goes back to following the browser.
export async function updateMyLocaleAction(params: { locale: Locale | typeof PSEUDO_LOCALE | null }): Promise<ActionResult> {
    try {
        const account = await requireAccount()
        const { locale } = params
        const pseudo = locale === PSEUDO_LOCALE && process.env.NODE_ENV !== 'production'
        if (locale !== null && !pseudo && !isStableLocale(locale)) return failure('unknownLanguage')

        if (!pseudo) {
            const { error } = await updateRows(serviceScope(), 'users', { locale }, { id: account.id })
            if (error) throw new Error(error.message)
        }

        const cookieStore = await cookies()
        const host = ((await headers()).get('host') ?? '').split(':')[0]
        const domain = host.endsWith('lumvika.com') ? '.lumvika.com' : undefined
        if (locale === null) cookieStore.set(LOCALE_COOKIE, '', { path: '/', maxAge: 0, domain })
        else cookieStore.set(LOCALE_COOKIE, locale, { path: '/', maxAge: LOCALE_COOKIE_MAX_AGE, sameSite: 'lax', domain })
        return { ok: true }
    } catch (err) {
        return failureOf(err, 'changeLanguageFailed')
    }
}

// The URL is written here and nowhere else: it ends up in an <img> on a teammate's screen, so
// nothing the browser sends may reach it verbatim.
export async function uploadMyAvatarAction(formData: FormData): Promise<ActionResult> {
    try {
        const account = await requireAccount()
        const file = formData.get('file')
        if (!(file instanceof File)) return failure('noFileProvided')
        if (!file.type.startsWith('image/')) return failure('chooseImage')
        if (file.size > AVATAR_MAX_BYTES) return failure('imageTooLarge', { max: AVATAR_MAX_BYTES / (1024 * 1024) })

        const url = await uploadPublicImage(serviceScope(), await file.arrayBuffer(), 'user-avatars', account.id, { maxSize: AVATAR_MAX_SIZE })
        await writeProfile({ image: url })
        return { ok: true }
    } catch (err) {
        return failureOf(err, 'uploadPhotoFailed')
    }
}

export async function removeMyAvatarAction(): Promise<ActionResult> {
    try {
        await requireAccount()
        await writeProfile({ image: null })
        return { ok: true }
    } catch (err) {
        return failureOf(err, 'removePhotoFailed')
    }
}

export type ConnectedIdentity = { email: string | null; canDisconnect: boolean }

export type SignInMethods = {
    email: string | null
    oauth: Record<OAuthProvider, ConnectedIdentity | null>
}

export async function getSignInMethodsAction(): Promise<ActionResult<{ methods: SignInMethods }>> {
    try {
        const account = await requireAccount()
        const linked = await providerAccountsOf(account.id)
        const email = realEmail(account.email)
        // A code mailed to the address always signs in, so a provider can go as long as there is one,
        // or another provider is left.
        const canDisconnect = !!email || linked.length > 1

        const connected = (provider: OAuthProvider): ConnectedIdentity | null => {
            const identity = linked.find(candidate => candidate.providerId === provider)
            return identity ? { email: identity.email, canDisconnect } : null
        }

        return {
            ok: true,
            methods: {
                email,
                oauth: Object.fromEntries(OAUTH_PROVIDERS.map(provider => [provider, connected(provider)])) as SignInMethods['oauth'],
            },
        }
    } catch (err) {
        return failureOf(err, 'loadSignInMethodsFailed')
    }
}

// The same rule as the list above: an account never loses its last way in.
export async function disconnectProviderAction(params: { provider: OAuthProvider }): Promise<ActionResult> {
    try {
        const account = await requireAccount()
        if (!isOAuthProvider(params.provider)) return failure('disconnectProviderFailed')
        const linked = await providerAccountsOf(account.id)
        if (!linked.some(identity => identity.providerId === params.provider)) return failure('disconnectProviderFailed')
        if (!realEmail(account.email) && linked.length < 2) return failure('lastSignInMethod')

        await serviceScope().run(db => db.delete(authAccounts).where(and(eq(authAccounts.userId, account.id), eq(authAccounts.providerId, params.provider))))
        return { ok: true }
    } catch (err) {
        return failureOf(err, 'disconnectProviderFailed')
    }
}

// `a.mail.example.com` is refused by a block on any of its parents, as at signup.
function domainAndParents(email: string): string[] {
    const labels = (email.split('@')[1] ?? '').split('.')
    return labels.map((_, index) => labels.slice(index).join('.')).filter(Boolean)
}

// What signing up checks on an address, asked again before the account moves to a new one. The
// auth layer mails nothing to an address another account holds, and says nothing about it either:
// this is where the person learns why no code came.
export async function prepareEmailChangeAction(params: { email: string }): Promise<ActionResult> {
    try {
        const account = await requireAccount()
        const email = normalizeEmail(params.email)
        if (!realEmail(email)) return failure('invalidEmail')
        if (email === account.email?.toLowerCase()) return failure('sameEmail')

        const { data: blocked } = await selectMany(serviceScope(), 'blocked_email_domains', ['domain'] as const, { domain: domainAndParents(email) }, undefined, 1)
        if (blocked?.length) return failure('emailDomainBlocked')

        if (await findAuthUserIdByEmail(email)) return failure('emailTaken')
        return { ok: true }
    } catch (err) {
        return failureOf(err, 'checkEmailFailed')
    }
}

// Called once the new address is confirmed. Best effort: the account has already moved.
export async function syncAccountEmailAction(): Promise<void> {
    try {
        const account = await requireAccount()
        const email = realEmail(account.email)
        if (email) await syncStripeCustomerEmail(account.id, email)
    } catch (err) {
        console.error('[account] email sync failed', err instanceof Error ? err.message : err)
    }
}

export async function getAccountDeletionStatusAction(): Promise<ActionResult<{ blockers: AccountDeletionBlocker[] }>> {
    try {
        const account = await requireAccount()
        return { ok: true, blockers: await accountDeletionBlockers(serviceScope(), account.id) }
    } catch (err) {
        return failureOf(err, 'checkAccountFailed')
    }
}

export async function deleteMyAccountAction(params: { confirmation: string }): Promise<ActionResult> {
    try {
        const account = await requireAccount()
        if (params.confirmation.trim() !== DELETE_ACCOUNT_CONFIRMATION) return failure('typeToConfirm', { word: DELETE_ACCOUNT_CONFIRMATION })

        const result = await anonymizeAccount(serviceScope(), account.id)
        if (!result.ok) return failure('cancelSubscriptionsFirst', { names: result.blockers.map(blocker => blocker.name).join(', ') })
        return { ok: true }
    } catch (err) {
        console.error('[account] deletion failed', err instanceof Error ? err.message : err)
        return failureOf(err, 'deleteAccountFailed')
    }
}
