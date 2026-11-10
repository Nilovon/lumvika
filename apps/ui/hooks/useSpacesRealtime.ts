'use client'

import { useBoardStore } from '@/stores/board.store'
import { useRealtimeSubscription } from '@/supabase/useRealtimeSubscription'

export function useSpacesRealtime(workspaceId: number | undefined) {
    const _realtimeInsertSpace = useBoardStore(s => s._realtimeInsertSpace)
    const _realtimeUpdateSpace = useBoardStore(s => s._realtimeUpdateSpace)
    const _realtimeDeleteSpace = useBoardStore(s => s._realtimeDeleteSpace)

    useRealtimeSubscription('spaces', {
        channelId: `spaces:workspace:${workspaceId}`,
        enabled: !!workspaceId,
        filter: workspaceId ? { column: 'workspace_id', value: workspaceId } : undefined,
        onInsert: _realtimeInsertSpace,
        onUpdate: _realtimeUpdateSpace,
        onDelete: record => {
            if (record.id) _realtimeDeleteSpace(record.id)
        },
    })
}
