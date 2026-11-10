import type { SupabaseClient, User } from '@supabase/supabase-js'
import type { Database } from '@/app/api/database.types'
import { realEmail } from '@/lib/auth/placeholder-email'
import { readProfile } from '@/lib/auth/user-profile'

type Client = SupabaseClient<Database>

async function loadAuthUser(supabase: Client, userId: string): Promise<User | null> {
    const { data, error } = await supabase.auth.admin.getUserById(userId)
    return error ? null : data.user
}

// Null when the account has no address mail can reach, such as a phone sign-in's placeholder.
export async function loadRecipient(supabase: Client, userId: string): Promise<{ email: string } | null> {
    const user = await loadAuthUser(supabase, userId)
    const email = realEmail(user?.email)
    return email ? { email } : null
}

export async function loadFirstName(supabase: Client, userId: string): Promise<string | null> {
    const user = await loadAuthUser(supabase, userId)
    return user ? (readProfile(user).name?.split(/\s+/)[0] ?? null) : null
}
