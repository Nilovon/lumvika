'use client'

import type { Tables } from '@/app/api/database.types'
import { subscribeLive } from '@/lib/live/client'
import type { LiveTable } from '@/lib/live/protocol'
import { useEffect, useRef } from 'react'

type EventCallbacks<T extends LiveTable> = {
    onInsert?: (payload: Tables<T>) => void
    // The second argument is empty: the stream never carries the row as it was.
    onUpdate?: (payload: Tables<T>, oldRecord: Tables<T>) => void
    // A deleted row holds its key and its workspace and user columns only.
    onDelete?: (payload: Tables<T>) => void
}

type FilterConfig = {
    column: string
    value: string | number
}

type UseRealtimeSubscriptionOptions<T extends LiveTable> = EventCallbacks<T> & {
    // Only the rows whose column holds this value.
    filter?: FilterConfig
    enabled?: boolean
    // Names the subscription; changing it subscribes again.
    channelId: string
    // Called after a (re)subscribe, when the tab comes back to the front and when the network comes
    // back: the consumer reads the rows again, to catch what happened while the stream was down.
    onResync?: () => void
}

const RESYNC_DELAY_MS = 200

// A delete keeps only some columns: one the filter names but the row lacks lets it through.
function matches(row: Record<string, unknown>, filter: FilterConfig | undefined): boolean {
    if (!filter || !(filter.column in row)) return true
    return String(row[filter.column]) === String(filter.value)
}

// Follows the changes of one table on the tab's live stream, as the server lets the user see them.
//
// @example
// useRealtimeSubscription('spaces', {
//   channelId: `spaces:${workspaceId}`,
//   filter: { column: 'workspace_id', value: workspaceId },
//   onInsert: space => add(space),
//   onDelete: space => remove(space.id),
// })
export function useRealtimeSubscription<T extends LiveTable>(table: T, options: UseRealtimeSubscriptionOptions<T>) {
    const { filter, onInsert, onUpdate, onDelete, onResync, enabled = true, channelId } = options

    const callbacksRef = useRef({ onInsert, onUpdate, onDelete, onResync })
    useEffect(() => {
        callbacksRef.current = { onInsert, onUpdate, onDelete, onResync }
    })

    const filterColumn = filter?.column
    const filterValue = filter?.value

    useEffect(() => {
        if (!enabled) return
        const activeFilter = filterColumn === undefined || filterValue === undefined ? undefined : { column: filterColumn, value: filterValue }
        let resyncTimer: ReturnType<typeof setTimeout> | null = null

        const unsubscribe = subscribeLive({
            onChange: ({ table: changed, op, row }) => {
                if (changed !== table || !matches(row, activeFilter)) return
                const callbacks = callbacksRef.current
                if (op === 'INSERT') callbacks.onInsert?.(row as Tables<T>)
                else if (op === 'UPDATE') callbacks.onUpdate?.(row as Tables<T>, {} as Tables<T>)
                else callbacks.onDelete?.(row as Tables<T>)
            },
            onResync: () => {
                if (!callbacksRef.current.onResync) return
                if (resyncTimer) clearTimeout(resyncTimer)
                resyncTimer = setTimeout(() => callbacksRef.current.onResync?.(), RESYNC_DELAY_MS)
            },
        })

        return () => {
            if (resyncTimer) clearTimeout(resyncTimer)
            unsubscribe()
        }
    }, [table, filterColumn, filterValue, enabled, channelId])
}
