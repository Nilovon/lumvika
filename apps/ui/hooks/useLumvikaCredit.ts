'use client'

import { lumvikaCreditOf, type LumvikaCredit } from '@/lib/engine/ai-sources'
import { useSession } from '@/lib/auth/session/SessionProvider'

export function useLumvikaCredit(): LumvikaCredit {
    const { workspace } = useSession()
    return lumvikaCreditOf(workspace)
}
