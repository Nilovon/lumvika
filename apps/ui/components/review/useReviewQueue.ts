'use client'

import { approveIssueAction, listReviewQueueAction, requestChangesAction, unblockIssueAction } from '@/app/api/_actions/review.actions'
import { useErrorText } from '@/hooks/useErrorText'
import type { ReviewQueue } from '@/lib/work/review-queue'
import { useSession } from '@/supabase/session/SessionProvider'
import { useRealtimeSubscription } from '@/supabase/useRealtimeSubscription'
import type { IssueSummary } from '@lumvika/contracts'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

const RELOAD_DELAY_MS = 400
const EMPTY_QUEUE: ReviewQueue = { toReview: [], blocked: [] }

type ActionResultOf = { ok: true; issue: IssueSummary } | { ok: false; code?: string; error: string }

function without(queue: ReviewQueue, issueId: string): ReviewQueue {
    return { toReview: queue.toReview.filter(item => item.issue.id !== issueId), blocked: queue.blocked.filter(item => item.issue.id !== issueId) }
}

// The issues that wait on a person, live: a change to any issue the reader sees reads the queue
// again. A verdict takes its item off at once and puts it back if the server refuses.
export function useReviewQueue() {
    const t = useTranslations('review.toasts')
    const errorText = useErrorText()
    const { workspace } = useSession()
    const workspaceId = workspace?.id
    const [queue, setQueue] = useState<ReviewQueue | null>(null)
    const [loadError, setLoadError] = useState<string | null>(null)
    const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    const settleLoad = useCallback(
        (result: Awaited<ReturnType<typeof listReviewQueueAction>>) => {
            if (!result.ok) {
                setLoadError(errorText(result))
                setQueue(current => current ?? EMPTY_QUEUE)
                return
            }
            setLoadError(null)
            setQueue(result.queue)
        },
        [errorText],
    )
    const reload = useCallback(() => listReviewQueueAction().then(settleLoad), [settleLoad])

    useEffect(() => {
        void listReviewQueueAction().then(settleLoad)
        return () => {
            if (reloadTimer.current) clearTimeout(reloadTimer.current)
        }
    }, [settleLoad])

    const scheduleReload = () => {
        if (reloadTimer.current) clearTimeout(reloadTimer.current)
        reloadTimer.current = setTimeout(() => void reload(), RELOAD_DELAY_MS)
    }

    useRealtimeSubscription('issues', {
        channelId: `review-queue-${workspaceId}`,
        enabled: workspaceId !== undefined,
        filter: workspaceId !== undefined ? { column: 'workspace_id', value: workspaceId } : undefined,
        onInsert: scheduleReload,
        onUpdate: scheduleReload,
        onDelete: scheduleReload,
        onResync: scheduleReload,
    })

    const settle = async (issueId: string, run: () => Promise<ActionResultOf>, success: (ref: string) => string): Promise<boolean> => {
        const before = queue
        setQueue(current => (current ? without(current, issueId) : current))
        const result = await run()
        if (!result.ok) {
            setQueue(before)
            toast.error(errorText(result))
            return false
        }
        toast.success(success(result.issue.ref))
        scheduleReload()
        return true
    }

    return {
        queue,
        loadError,
        reload,
        approve: (issueId: string) => settle(issueId, () => approveIssueAction(issueId), ref => t('approved', { ref })),
        requestChanges: (issueId: string, comment: string) => settle(issueId, () => requestChangesAction(issueId, comment), ref => t('changesRequested', { ref })),
        unblock: (issueId: string, comment: string) => settle(issueId, () => unblockIssueAction(issueId, comment || null), ref => t('unblocked', { ref })),
    }
}
