'use client'

import { useAttentionSessions, type AttentionSession } from '@/hooks/useAttentionSessions'
import { useBoardStore } from '@/stores/board.store'
import { useMemo } from 'react'

// The conversations that wait on the reader, read the way the workspace inbox reads them: a row whose
// notification went to someone else is theirs, and one still loading its reason waits (null) rather
// than flashes in.
export function useWaitingConversations(): AttentionSession[] | null {
    const sessions = useAttentionSessions()
    const agents = useBoardStore(state => state.agents)
    const hydrated = useBoardStore(state => state.hydrated)
    return useMemo(() => {
        if (!hydrated || sessions.some(session => session.reason === undefined)) return null
        const known = new Set(agents.map(agent => agent.id))
        return sessions.filter(session => !!session.reason && known.has(session.agentId))
    }, [sessions, agents, hydrated])
}
