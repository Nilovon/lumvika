'use client'

import { isTemplateContentLocked } from '@/lib/templates/content-lock'
import { useBoardStore } from '@/stores/board.store'
import { useSession } from '@/lib/auth/session/SessionProvider'

// Whether this agent's inherited content is sealed. The server has already replaced the payload by
// the time a panel renders it: this only decides whether to draw the lock over the filler, which is
// why it can be answered from what the board and the session already hold.
export function useTemplateContentLock(agentId: string): boolean {
    const { workspace } = useSession()
    const templateId = useBoardStore(s => s.agents.find(agent => agent.id === agentId)?.templateId ?? null)
    return isTemplateContentLocked({ templateId }, workspace)
}
