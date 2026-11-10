'use client'

import { lumvikaCreditOf, type LumvikaCredit } from '@/lib/engine/ai-sources'
import { useSession } from '@/supabase/session/SessionProvider'

export function useLumvikaCredit(): LumvikaCredit {
    const { workspace } = useSession()
    return lumvikaCreditOf(workspace)
}
