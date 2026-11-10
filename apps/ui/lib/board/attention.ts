import { ATTENTION_STATUSES as ATTENTION_STATUS_LIST } from '@lumvika/contracts'
import type { SessionEntry, SessionStatus } from '@/lib/board/types'

export { ATTENTION_STATUS_META as STATUS_META } from '@lumvika/ui/inbox'

export const ATTENTION_STATUSES = new Set<SessionStatus>(ATTENTION_STATUS_LIST)

// Ce que l'onglet « To handle » d'un agent affiche, compté pour tous les agents d'un coup. Un agent
// sans rien en attente est absent de la map plutôt que posé à 0 : les appelants lisent `?? 0`.
export function attentionCountByAgent(sessions: SessionEntry[]): Record<string, number> {
    const counts: Record<string, number> = {}
    for (const s of sessions) {
        if (!ATTENTION_STATUSES.has(s.status)) continue
        counts[s.agentId] = (counts[s.agentId] ?? 0) + 1
    }
    return counts
}
