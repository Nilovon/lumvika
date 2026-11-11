'use client'

import { findSessionIdByEngineSessionAction } from '@/app/api/_actions/conversation-reads.actions'
import { useBoardStore } from '@/stores/board.store'

type OpenConversationArgs = {
    agentId: string | null
    engineSessionId: string | null
    engineRunId: string | null
}

// Opens the conversation tied to a notification: selects the agent and forces its panel onto the
// conversation tab, then, once the engine session id is resolved to the DB session id, drives the
// chat to the exact conversation. The tab is forced before the lookup so a notification without a
// resolvable session still lands on the chat rather than on whatever tab was left active.
export async function openConversationFromNotification({ agentId, engineSessionId, engineRunId }: OpenConversationArgs): Promise<void> {
    if (!agentId) return

    useBoardStore.getState().openAgentChat(agentId)

    if (!engineSessionId) return

    const sessionId = await findSessionIdByEngineSessionAction(agentId, engineSessionId).catch(() => null)
    if (!sessionId) return

    useBoardStore.getState().setPendingOpenSession({ agentId, sessionId, runId: engineRunId })
}
