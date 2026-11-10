import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/app/api/database.types'

export async function isPhoneStepPending(_supabase: SupabaseClient<Database>, _userId: string): Promise<boolean> {
    return false
}

export async function phoneOwnerId(_admin: SupabaseClient<Database>, _phone: string): Promise<{ userId: string | null } | null> {
    return { userId: null }
}
