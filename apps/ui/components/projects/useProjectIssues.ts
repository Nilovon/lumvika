'use client'

import { createIssueAction, getIssueAction, listProjectIssuesAction, moveIssueAction, transitionIssueAction } from '@/app/api/_actions/issues.actions'
import { issueSummaryOfRow } from '@/components/issues/issue-mappers'
import { countMove, endOfColumn, moreOf, moveLocally, upsertIssue, type ColumnTotals } from '@/components/projects/board/board-logic'
import { useErrorText } from '@/hooks/useErrorText'
import { useRealtimeSubscription } from '@/lib/live/useRealtimeSubscription'
import { issueSummarySchema, type CreateIssueInput, type IssueStatus, type IssueSummary } from '@lumvika/contracts'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

export type ProjectIssues = ReturnType<typeof useProjectIssues>

// An action the server never answered (the network dropped it) reads as a refusal without a reason.
const unreached = () => ({ ok: false as const, error: '' })

// The issues of one project, live: the realtime feed applies what other people and coworkers change,
// and a change made here shows at once and rolls back if the server refuses it. While a change of
// this tab is in flight, the feed leaves that issue alone so an older row cannot undo it on screen;
// a refused change reads the issue back from the server rather than trusting either.
//
// Each column loads up to a limit, and `totals` says how many it holds in all: a long column shows
// that it is cut and loads more on demand.
export function useProjectIssues(projectId: string | null, projectKey: string) {
    const errorText = useErrorText()
    const [issues, setIssues] = useState<IssueSummary[] | null>(null)
    const [totals, setTotals] = useState<ColumnTotals | null>(null)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [loadingMore, setLoadingMore] = useState(false)
    const pending = useRef(new Map<string, number>())
    const limits = useRef<Partial<Record<IssueStatus, number>>>({})
    const current = useRef<IssueSummary[] | null>(null)

    useEffect(() => {
        current.current = issues
    }, [issues])

    const reload = useCallback(async () => {
        if (!projectId) return
        const result = await listProjectIssuesAction(projectId, limits.current)
        if (!result.ok) {
            setLoadError(errorText(result))
            setIssues(shown => shown ?? [])
            return
        }
        setLoadError(null)
        setTotals(result.totals)
        // An issue with a change in flight keeps what this tab shows until the change lands.
        setIssues(shown => result.issues.map(fresh => (pending.current.has(fresh.id) ? (shown?.find(issue => issue.id === fresh.id) ?? fresh) : fresh)))
    }, [projectId, errorText])

    useEffect(() => {
        limits.current = {}
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIssues(null)
        setTotals(null)
        void reload()
    }, [reload])

    // Loads the next cards of one column, or of every column cut short when none is named.
    const showMore = async (status?: IssueStatus) => {
        const shown = current.current ?? []
        limits.current = { ...limits.current, ...moreOf(shown, totals, status) }
        setLoadingMore(true)
        try {
            await reload()
        } finally {
            setLoadingMore(false)
        }
    }

    const applyRow = (row: Parameters<typeof issueSummaryOfRow>[0], inserted: boolean) => {
        if (pending.current.has(row.id)) return
        const next = issueSummaryOfRow(row, projectKey)
        const known = current.current?.find(issue => issue.id === next.id)
        // An update of a card this tab never loaded was already counted in its column.
        if (known || inserted) setTotals(counted => countMove(counted, known?.status ?? null, next.status))
        setIssues(shown => (shown ? upsertIssue(shown, next) : shown))
    }

    useRealtimeSubscription('issues', {
        channelId: `project-issues-${projectId}`,
        enabled: !!projectId,
        filter: projectId ? { column: 'project_id', value: projectId } : undefined,
        onInsert: row => applyRow(row, true),
        onUpdate: row => applyRow(row, false),
        onDelete: row => {
            if (row.project_id !== projectId) return
            const known = current.current?.find(issue => issue.id === row.id)
            if (known) setTotals(counted => countMove(counted, known.status, null))
            setIssues(shown => shown?.filter(issue => issue.id !== row.id) ?? shown)
        },
        onResync: () => void reload(),
    })

    // A coworker's run that failed before it took an issue changes nothing on the issue's row: the
    // card learns it from the log.
    useRealtimeSubscription('activity_events', {
        channelId: `project-run-failures-${projectId}`,
        enabled: !!projectId,
        filter: projectId ? { column: 'project_id', value: projectId } : undefined,
        onInsert: row => {
            if (row.action === 'issue.run_failed') void reload()
        },
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

    const showLocally = (issue: IssueSummary, status: IssueStatus, position: number) => {
        setTotals(counted => countMove(counted, issue.status, status))
        setIssues(shown => (shown ? moveLocally(shown, issue.id, status, position) : shown))
    }

    // A refused change: what the server holds now, whatever arrived while it was in flight. Without an
    // answer, the card goes back to where it was before the drag. `shownIn` is the column this tab
    // moved it to.
    const reread = async (before: IssueSummary, shownIn: IssueStatus) => {
        const result = await getIssueAction(before.ref)
        const truth = result.ok ? issueSummarySchema.parse(result.issue) : result.code === 'issueNotFound' ? null : before
        setTotals(counted => countMove(counted, shownIn, truth?.status ?? null))
        setIssues(shown => (shown ? (truth ? upsertIssue(shown, truth) : shown.filter(issue => issue.id !== before.id)) : shown))
    }

    const landed = (shownIn: IssueStatus, issue: IssueSummary) => {
        setTotals(counted => countMove(counted, shownIn, issue.status))
        setIssues(list => (list ? upsertIssue(list, issue) : list))
    }

    // A drop on the board: a new column and a new place, both shown before the server answers. The
    // server places the card above `beforeIssueId` (the end when null) in the whole column.
    const move = async (issue: IssueSummary, status: IssueStatus, position: number, beforeIssueId: string | null): Promise<boolean> => {
        showLocally(issue, status, position)
        const result = await track(issue.id, () => moveIssueAction(issue.id, { status, beforeIssueId }).catch(unreached))
        if (!result.ok) {
            toast.error(errorText(result))
            await track(issue.id, () => reread(issue, status).then(() => ({ ok: true })))
            return false
        }
        landed(status, result.issue)
        return true
    }

    // A change of status without a place: the card goes to the end of its new column.
    const transition = async (issue: IssueSummary, status: IssueStatus, blockedReason?: string | null): Promise<boolean> => {
        showLocally(issue, status, endOfColumn(current.current ?? [], status))
        const result = await track(issue.id, () => transitionIssueAction(issue.id, status, blockedReason).catch(unreached))
        if (!result.ok) {
            toast.error(errorText(result))
            await track(issue.id, () => reread(issue, status).then(() => ({ ok: true })))
            return false
        }
        landed(status, result.issue)
        return true
    }

    const create = async (input: CreateIssueInput): Promise<IssueSummary | null> => {
        const result = await createIssueAction(input)
        if (!result.ok) {
            toast.error(errorText(result))
            return null
        }
        const known = current.current?.some(issue => issue.id === result.issue.id)
        if (!known) setTotals(counted => countMove(counted, null, result.issue.status))
        setIssues(shown => (shown ? upsertIssue(shown, result.issue) : [result.issue]))
        return result.issue
    }

    // What another surface (the issue dialog) already wrote: shown here without a round trip.
    const apply = useCallback((issue: IssueSummary) => {
        const shown = current.current?.find(candidate => candidate.id === issue.id)
        if (shown) setTotals(counted => countMove(counted, shown.status, issue.status))
        setIssues(list => (list ? upsertIssue(list, issue) : list))
    }, [])

    return { issues, totals, loadError, loadingMore, reload, showMore, move, transition, create, apply }
}
