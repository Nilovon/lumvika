'use client'

import { rerunCreditOf, type RerunCredit } from '@/lib/engine/ai-sources'
import { useSession } from '@/supabase/session/SessionProvider'

export function useRerunCredit(): RerunCredit {
    const { workspace } = useSession()
    return rerunCreditOf(workspace)
}
