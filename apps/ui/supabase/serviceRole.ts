import type { Database } from '@/app/api/database.types'
import { createClient } from '@supabase/supabase-js'

// Hors navigateur, autoRefreshToken lance un setInterval qui ne s'arrête jamais et garde en vie le
// contexte de la requête qui a créé le client : un client par requête faisait fuir la prod.
export function createServiceRoleClient() {
    return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
}
