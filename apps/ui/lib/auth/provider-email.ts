import 'server-only'
import { getAuth } from '@/lib/auth/auth'
import { OAUTH_PROVIDERS } from '@/lib/auth/oauth-providers'
import { and, desc, eq, findAuthUserIdByEmail, inArray, serviceScope } from '@/lib/db'
import { authAccounts } from '@lumvika/db/schema'

// The address a provider vouched for, read off the ID token it handed over at the code exchange. The
// token reached the server from the provider's own endpoint, never through the browser.
export function emailInIdToken(idToken: string | null | undefined): string | null {
    const payload = idToken?.split('.')[1]
    if (!payload) return null
    try {
        const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { email?: unknown }
        return typeof claims.email === 'string' && claims.email.includes('@') ? claims.email.trim().toLowerCase() : null
    } catch {
        return null
    }
}

export type ProviderAccount = { id: string; providerId: string; email: string | null }

export async function providerAccountsOf(userId: string): Promise<ProviderAccount[]> {
    const rows = await serviceScope().run(db =>
        db
            .select({ id: authAccounts.id, providerId: authAccounts.providerId, idToken: authAccounts.idToken })
            .from(authAccounts)
            .where(and(eq(authAccounts.userId, userId), inArray(authAccounts.providerId, [...OAUTH_PROVIDERS])))
            .orderBy(desc(authAccounts.createdAt))
    )
    return rows.map(row => ({ id: row.id, providerId: row.providerId, email: emailInIdToken(row.idToken) }))
}

export type ProviderEmailClaim = 'claimed' | 'taken' | 'failed'

// Linking a provider keeps the anonymous visitor's id but leaves the placeholder address on it: the
// provider's address is what turns the visitor into an account, through the same update hook as a
// claimed email. An address that already has an account means the visitor meant to sign into it:
// the identity is taken off the visitor again so the sign-in that follows can reach that account.
export async function claimProviderEmail(userId: string): Promise<ProviderEmailClaim> {
    const [linked] = await providerAccountsOf(userId)
    if (!linked) return 'failed'
    if (!linked.email) {
        await releaseAccount(linked.id)
        return 'failed'
    }
    const owner = await findAuthUserIdByEmail(linked.email)
    if (owner && owner !== userId) {
        await releaseAccount(linked.id)
        return 'taken'
    }
    try {
        await (await getAuth().$context).internalAdapter.updateUser(userId, { email: linked.email })
        return 'claimed'
    } catch (error) {
        console.error('[auth] could not claim the provider address', error instanceof Error ? error.message : error)
        await releaseAccount(linked.id)
        return 'failed'
    }
}

async function releaseAccount(accountId: string) {
    await serviceScope().run(db => db.delete(authAccounts).where(eq(authAccounts.id, accountId)))
}
