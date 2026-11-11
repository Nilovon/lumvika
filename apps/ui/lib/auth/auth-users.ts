import 'server-only'
import { and, eq, gte, lt, serviceScope } from '@/lib/db'
import { authUsers } from '@lumvika/db/schema'

// The anonymous visitors born in `[after, before)`, oldest first. `after` null reaches back to the first.
export async function listAnonymousUserIds({ after, before }: { after: Date | null; before: Date }): Promise<string[]> {
    const rows = await serviceScope().run(db =>
        db
            .select({ id: authUsers.id })
            .from(authUsers)
            .where(and(eq(authUsers.isAnonymous, true), lt(authUsers.createdAt, before), after ? gte(authUsers.createdAt, after) : undefined))
            .orderBy(authUsers.createdAt)
    )
    return rows.map(row => row.id)
}

// Removing the auth row takes its sessions, accounts and `public.users` row with it.
export async function deleteAuthUser(userId: string): Promise<void> {
    await serviceScope().run(db => db.delete(authUsers).where(eq(authUsers.id, userId)))
}
