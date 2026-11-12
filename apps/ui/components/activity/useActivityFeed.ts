'use client'

import { listActivityFeedAction, type ActivityFeedFilters } from '@/app/api/_actions/activity.actions'
import type { ActivityRefs } from '@/app/api/_services/work/activity-feed.service'
import { mergeEvents, mergeRefs, NO_REFS } from '@/components/activity/activity-feed'
import { useErrorText } from '@/hooks/useErrorText'
import { useSession } from '@/supabase/session/SessionProvider'
import { useRealtimeSubscription } from '@/supabase/useRealtimeSubscription'
import type { ActivityEvent } from '@lumvika/contracts'
import { useCallback, useEffect, useRef, useState } from 'react'

const LIVE_DELAY_MS = 500
const LIVE_PAGE = 20

// `key` names the filters the feed was read with: a feed of other filters is not shown.
type FeedState = { key: string; events: ActivityEvent[]; refs: ActivityRefs; nextCursor: string | null }

type FeedResult = Awaited<ReturnType<typeof listActivityFeedAction>>

// The workspace feed for a set of filters: a first page, then older ones on demand. A new event
// (RLS sends only those the reader may see) reads the top of the feed again and slides in above.
export function useActivityFeed(filters: Omit<ActivityFeedFilters, 'before' | 'limit'>) {
    const errorText = useErrorText()
    const { workspace } = useSession()
    const workspaceId = workspace?.id
    const [feed, setFeed] = useState<FeedState | null>(null)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [loadingMore, setLoadingMore] = useState(false)
    const filtersKey = JSON.stringify(filters)
    const current = useRef(filtersKey)
    const liveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const query = useCallback((extra: Pick<ActivityFeedFilters, 'before' | 'limit'> = {}) => listActivityFeedAction({ ...(JSON.parse(filtersKey) as ActivityFeedFilters), ...extra }), [filtersKey])

    const settleFirstPage = useCallback(
        (key: string, result: FeedResult) => {
            if (current.current !== key) return
            if (!result.ok) {
                setLoadError(errorText(result))
                setFeed({ key, events: [], refs: NO_REFS, nextCursor: null })
                return
            }
            setLoadError(null)
            setFeed({ key, events: result.page.events, refs: result.page.refs, nextCursor: result.page.nextCursor })
        },
        [errorText],
    )

    useEffect(() => {
        current.current = filtersKey
        void query().then(result => settleFirstPage(filtersKey, result))
    }, [filtersKey, query, settleFirstPage])

    useEffect(
        () => () => {
            if (liveTimer.current) clearTimeout(liveTimer.current)
        },
        [],
    )

    const shown = feed?.key === filtersKey ? feed : null

    const reload = () => query().then(result => settleFirstPage(filtersKey, result))

    const loadMore = async () => {
        if (!shown?.nextCursor || loadingMore) return
        setLoadingMore(true)
        const result = await query({ before: shown.nextCursor })
        setLoadingMore(false)
        if (current.current !== filtersKey) return
        if (!result.ok) {
            setLoadError(errorText(result))
            return
        }
        setFeed(state => (state?.key === filtersKey ? { ...state, events: mergeEvents(state.events, result.page.events), refs: mergeRefs(state.refs, result.page.refs), nextCursor: result.page.nextCursor } : state))
    }

    const readTop = async () => {
        const result = await query({ limit: LIVE_PAGE })
        if (current.current !== filtersKey || !result.ok) return
        setFeed(state => (state?.key === filtersKey ? { ...state, events: mergeEvents(state.events, result.page.events), refs: mergeRefs(state.refs, result.page.refs) } : state))
    }

    useRealtimeSubscription('activity_events', {
        channelId: `activity-feed-${workspaceId}`,
        enabled: workspaceId !== undefined,
        filter: workspaceId !== undefined ? { column: 'workspace_id', value: workspaceId } : undefined,
        onInsert: () => {
            if (liveTimer.current) clearTimeout(liveTimer.current)
            liveTimer.current = setTimeout(() => void readTop(), LIVE_DELAY_MS)
        },
        onResync: () => void readTop(),
    })

    return { feed: shown, loadError, loadingMore, loadMore, reload }
}
