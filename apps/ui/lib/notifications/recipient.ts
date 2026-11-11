import { authUsers } from '@lumvika/db/schema'
import { realEmail } from '@/lib/auth/placeholder-email'
import { eq, serviceScope, type DbScope } from '@/lib/db'

// `email` and `name` are null for an anonymous visitor, who has neither yet.
export type AuthAccount = { email: string | null; name: string | null }

// The auth tables are only readable by the service, whatever scope the caller works in.
export async function loadAuthAccount(_scope: DbScope, userId: string): Promise<AuthAccount | null> {
    try {
        const [row] = await serviceScope().run(db => db.select({ email: authUsers.email, name: authUsers.name, isAnonymous: authUsers.isAnonymous }).from(authUsers).where(eq(authUsers.id, userId)).limit(1))
        if (!row) return null
        if (row.isAnonymous) return { email: null, name: null }
        return { email: row.email, name: row.name.trim() || null }
    } catch {
        return null
    }
}

// Null when the account has no address mail can reach, such as a phone sign-in's placeholder.
export async function loadRecipient(scope: DbScope, userId: string): Promise<{ email: string } | null> {
    const account = await loadAuthAccount(scope, userId)
    const email = realEmail(account?.email)
    return email ? { email } : null
}

export async function loadFirstName(scope: DbScope, userId: string): Promise<string | null> {
    const account = await loadAuthAccount(scope, userId)
    return account?.name?.split(/\s+/)[0] ?? null
}
