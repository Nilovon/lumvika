'use client'

import { createIssueAction, listProjectIssuesAction, moveIssueAction, transitionIssueAction } from '@/app/api/_actions/issues.actions'
import { issueSummaryOfRow } from '@/components/issues/issue-mappers'
import { endOfColumn, moveLocally, upsertIssue } from '@/components/projects/board/board-logic'
import { useErrorText } from '@/hooks/useErrorText'
import { useRealtimeSubscription } from '@/supabase/useRealtimeSubscription'
import type { CreateIssueInput, IssueStatus, IssueSummary } from '@lumvika/contracts'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

export type ProjectIssues = ReturnType<typeof useProjectIssues>

// The issues of one project, live: the realtime feed applies what other people and coworkers change,
// and a change made here shows at once and rolls back if the server refuses it. While a change of
// this tab is in flight, the feed leaves that issue alone so an older row cannot undo it on screen.
export function useProjectIssues(projectId: string | null, projectKey: string) {
    const errorText = useErrorText()
    const [issues, setIssues] = useState<IssueSummary[] | null>(null)
    const [loadError, setLoadError] = useState<string | null>(null)
    const pending = useRef(new Map<string, number>())

    const reload = useCallback(async () => {
        if (!projectId) return
        const result = await listProjectIssuesAction(projectId)
        if (!result.ok) {
            setLoadError(errorText(result))
            setIssues(current => current ?? [])
            return
        }
        setLoadError(null)
        // An issue with a change in flight keeps what this tab shows until the change lands.
        setIssues(current => result.issues.map(fresh => (pending.current.has(fresh.id) ? (current?.find(issue => issue.id === fresh.id) ?? fresh) : fresh)))
    }, [projectId, errorText])

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIssues(null)
        void reload()
    }, [reload])

    const applyRow = (row: Parameters<typeof issueSummaryOfRow>[0]) => {
        if (pending.current.has(row.id)) return
        setIssues(current => (current ? upsertIssue(current, issueSummaryOfRow(row, projectKey)) : current))
    }

    useRealtimeSubscription('issues', {
        channelId: `project-issues-${projectId}`,
        enabled: !!projectId,
        filter: projectId ? { column: 'project_id', value: projectId } : undefined,
        onInsert: applyRow,
        onUpdate: applyRow,
        onDelete: row => {
            if (row.project_id !== projectId) return
            setIssues(current => current?.filter(issue => issue.id !== row.id) ?? current)
        },
        onResync: () => void reload(),
    })

    const track = async <T extends { ok: boolean }>(issueId: string, run: () => Promise<T>): Promise<T> => {
        pending.current.set(issueId, (pending.current.get(issueId) ?? 0) + 1)
        try {
            return await run()
        } finally {
            const left = (pending.current.get(issueId) ?? 1) - 1
            if (left <= 0) pending.current.delete(issueId)
            else pending.current.set(issueId, left)
        }
    }

    const restore = (previous: IssueSummary) => setIssues(current => (current ? upsertIssue(current, previous) : current))

    // A drop on the board: a new column and a new place, both shown before the server answers.
    const move = async (issue: IssueSummary, status: IssueStatus, position: number): Promise<boolean> => {
        setIssues(current => (current ? moveLocally(current, issue.id, status, position) : current))
        const result = await track(issue.id, () => moveIssueAction(issue.id, { status, position }))
        if (!result.ok) {
            restore(issue)
            toast.error(errorText(result))
            return false
        }
        setIssues(current => (current ? upsertIssue(current, result.issue) : current))
        return true
    }

    // A change of status without a place: the card goes to the end of its new column.
    const transition = async (issue: IssueSummary, status: IssueStatus, blockedReason?: string | null): Promise<boolean> => {
        setIssues(current => (current ? moveLocally(current, issue.id, status, endOfColumn(current, status)) : current))
        const result = await track(issue.id, () => transitionIssueAction(issue.id, status, blockedReason))
        if (!result.ok) {
            restore(issue)
            toast.error(errorText(result))
            return false
        }
        setIssues(current => (current ? upsertIssue(current, result.issue) : current))
        return true
    }

    const create = async (input: CreateIssueInput): Promise<IssueSummary | null> => {
        const result = await createIssueAction(input)
        if (!result.ok) {
            toast.error(errorText(result))
            return null
        }
        setIssues(current => (current ? upsertIssue(current, result.issue) : [result.issue]))
        return result.issue
    }

    // What another surface (the issue dialog) already wrote: shown here without a round trip.
    const apply = useCallback((issue: IssueSummary) => setIssues(current => (current ? upsertIssue(current, issue) : current)), [])

    return { issues, loadError, reload, move, transition, create, apply }
}
