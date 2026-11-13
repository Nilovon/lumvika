'use client'

import { transitionIssueAction } from '@/app/api/_actions/issues.actions'
import { listMyWorkAction } from '@/app/api/_actions/work-overview.actions'
import type { MyWork } from '@/app/api/_services/work/my-work.service'
import { useErrorText } from '@/hooks/useErrorText'
import { useSession } from '@/supabase/session/SessionProvider'
import { useRealtimeSubscription } from '@/supabase/useRealtimeSubscription'
import type { IssueStatus, IssueSummary } from '@lumvika/contracts'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

const RELOAD_DELAY_MS = 400

function patchEverywhere(work: MyWork, issue: IssueSummary): MyWork {
    const patch = (list: IssueSummary[]) => list.map(item => (item.id === issue.id ? issue : item))
    return { ...work, assigned: patch(work.assigned), created: patch(work.created), delegated: patch(work.delegated) }
}

// "My work", live: any change to an issue of the workspace (RLS sends only those the reader sees)
// reads the three lists again, once the burst of changes is over.
export function useMyWork() {
    const errorText = useErrorText()
    const { workspace } = useSession()
    const workspaceId = workspace?.id
    const [work, setWork] = useState<MyWork | null>(null)
    const [loadError, setLoadError] = useState<string | null>(null)
    const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    const settleLoad = useCallback(
        (result: Awaited<ReturnType<typeof listMyWorkAction>>) => {
            if (!result.ok) {
                setLoadError(errorText(result))
                setWork(current => current ?? { assigned: [], created: [], delegated: [], projects: [] })
                return
            }
            setLoadError(null)
            setWork(result.work)
        },
        [errorText],
    )
    const reload = useCallback(() => listMyWorkAction().then(settleLoad), [settleLoad])

    useEffect(() => {
        void listMyWorkAction().then(settleLoad)
        return () => {
            if (reloadTimer.current) clearTimeout(reloadTimer.current)
        }
    }, [settleLoad])

    const scheduleReload = () => {
        if (reloadTimer.current) clearTimeout(reloadTimer.current)
        reloadTimer.current = setTimeout(() => void reload(), RELOAD_DELAY_MS)
    }

    useRealtimeSubscription('issues', {
        channelId: `my-work-${workspaceId}`,
        enabled: workspaceId !== undefined,
        filter: workspaceId !== undefined ? { column: 'workspace_id', value: workspaceId } : undefined,
        onInsert: scheduleReload,
        onUpdate: scheduleReload,
        onDelete: scheduleReload,
        onResync: scheduleReload,
    })

    // Shown at once, rolled back if the server refuses it.
    const changeStatus = async (issue: IssueSummary, status: IssueStatus, blockedReason?: string | null): Promise<boolean> => {
        setWork(current => (current ? patchEverywhere(current, { ...issue, status }) : current))
        const result = await transitionIssueAction(issue.id, status, blockedReason)
        if (!result.ok) {
            setWork(current => (current ? patchEverywhere(current, issue) : current))
            toast.error(errorText(result))
            return false
        }
        setWork(current => (current ? patchEverywhere(current, result.issue) : current))
        return true
    }

    const apply = useCallback((issue: IssueSummary) => setWork(current => (current ? patchEverywhere(current, issue) : current)), [])

    return { work, loadError, reload, changeStatus, apply }
}
