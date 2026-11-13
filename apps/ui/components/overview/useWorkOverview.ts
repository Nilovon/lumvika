'use client'

import { getWorkOverviewAction } from '@/app/api/_actions/work-overview.actions'
import type { WorkOverview } from '@/app/api/_services/work/overview.service'
import { useErrorText } from '@/hooks/useErrorText'
import { useSession } from '@/lib/auth/session/SessionProvider'
import { useRealtimeSubscription } from '@/lib/live/useRealtimeSubscription'
import { useCallback, useEffect, useRef, useState } from 'react'

const RELOAD_DELAY_MS = 1_000

// The overview, kept current: a change to an issue or a new event reads it again once the burst of
// changes is over (one round trip, whatever changed).
export function useWorkOverview() {
    const errorText = useErrorText()
    const { workspace } = useSession()
    const workspaceId = workspace?.id
    const [overview, setOverview] = useState<WorkOverview | null>(null)
    const [loadError, setLoadError] = useState<string | null>(null)
    const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    const settleLoad = useCallback(
        (result: Awaited<ReturnType<typeof getWorkOverviewAction>>) => {
            if (!result.ok) {
                setLoadError(errorText(result))
                return
            }
            setLoadError(null)
            setOverview(result.overview)
        },
        [errorText],
    )
    const reload = useCallback(() => getWorkOverviewAction().then(settleLoad), [settleLoad])

    useEffect(() => {
        void getWorkOverviewAction().then(settleLoad)
        return () => {
            if (reloadTimer.current) clearTimeout(reloadTimer.current)
        }
    }, [settleLoad])

    const scheduleReload = () => {
        if (reloadTimer.current) clearTimeout(reloadTimer.current)
        reloadTimer.current = setTimeout(() => void reload(), RELOAD_DELAY_MS)
    }
    const live = { enabled: workspaceId !== undefined, filter: workspaceId !== undefined ? { column: 'workspace_id', value: workspaceId } : undefined }

    useRealtimeSubscription('issues', { ...live, channelId: `overview-issues-${workspaceId}`, onInsert: scheduleReload, onUpdate: scheduleReload, onDelete: scheduleReload, onResync: scheduleReload })
    useRealtimeSubscription('activity_events', { ...live, channelId: `overview-activity-${workspaceId}`, onInsert: scheduleReload })

    return { overview, loadError, reload }
}
