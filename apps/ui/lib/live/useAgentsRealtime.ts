'use client'

import { agentFromRow } from '@/lib/board/types'
import { useRealtimeSubscription } from '@/lib/live/useRealtimeSubscription'
import { useBoardStore } from '@/stores/board.store'

export function useAgentsRealtime(workspaceId: number | undefined) {
    useRealtimeSubscription('agents', {
        channelId: `agents-ws-${workspaceId}`,
        filter: workspaceId ? { column: 'workspace_id', value: workspaceId } : undefined,
        enabled: !!workspaceId,
        onInsert: row => {
            useBoardStore.getState()._onAgentInsert(agentFromRow(row))
        },
        onUpdate: row => {
            useBoardStore.getState()._onAgentUpdate(agentFromRow(row))
        },
        onDelete: row => {
            useBoardStore.getState()._onAgentDelete(row.id)
        },
    })
}
