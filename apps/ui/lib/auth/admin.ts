import { isAdminEmail } from '@/lib/auth/admin-emails'
import { createClient } from '@/supabase/server'

// Returns the authenticated admin's email, or null if the current session is not an admin.
export async function getAdminEmail(): Promise<string | null> {
    const supabase = await createClient()
    const { data } = await supabase.auth.getUser()
    const email = data.user?.email
    if (!isAdminEmail(email)) return null
    return email!
}

// Throws if the current session is not an admin. Call first in every admin server action.
export async function assertAdminUser(): Promise<void> {
    const email = await getAdminEmail()
    if (!email) throw new Error('Unauthorized')
}

// Same check, but hands back the admin's user id for the rows that record who reviewed what.
export async function requireAdminUserId(): Promise<string> {
    const supabase = await createClient()
    const { data } = await supabase.auth.getUser()
    if (!isAdminEmail(data.user?.email)) throw new Error('Unauthorized')
    return data.user!.id
}
