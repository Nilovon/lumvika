import { eq } from 'drizzle-orm'

import { getDb } from './pool'
import { authUsers } from './schema'

// Better Auth owns `auth.users`; the app only looks a person up there by the address they typed.
export async function findAuthUserIdByEmail(email: string): Promise<string | null> {
    const [row] = await getDb().select({ id: authUsers.id }).from(authUsers).where(eq(authUsers.email, email.trim().toLowerCase())).limit(1)
    return row?.id ?? null
}
