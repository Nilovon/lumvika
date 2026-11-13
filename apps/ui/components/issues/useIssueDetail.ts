'use client'

import {
    addIssueCommentAction,
    assignIssueAction,
    createSubIssueAction,
    editIssueCommentAction,
    getIssueAction,
    listIssueActivityAction,
    listIssueCommentsAction,
    transitionIssueAction,
    updateIssueAction,
} from '@/app/api/_actions/issues.actions'
import { issueCommentOfRow } from '@/components/issues/issue-mappers'
import { useErrorText } from '@/hooks/useErrorText'
import { keepRunFailure } from '@/lib/work/run-failure'
import { useRealtimeSubscription } from '@/lib/live/useRealtimeSubscription'
import type { ActivityEvent, IssueComment, IssueDetail, IssueStatus, IssueSummary, UpdateIssueInput, WorkMemberRef } from '@lumvika/contracts'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

export type IssueDetailState = { status: 'loading' } | { status: 'missing'; message: string } | { status: 'ready'; issue: IssueDetail }

const REFRESH_DELAY_MS = 250

// One issue with its comments and its log, kept live: a coworker's progress, a teammate's comment or
// edit lands without a reload. Every change made here is handed to `onIssueChange`, so the board or
// the list behind the dialog shows it at once.
export function useIssueDetail(issueRef: string | null, onIssueChange?: (issue: IssueSummary) => void) {
    const errorText = useErrorText()
    const [state, setState] = useState<IssueDetailState>({ status: 'loading' })
    const [comments, setComments] = useState<IssueComment[] | null>(null)
    const [activity, setActivity] = useState<ActivityEvent[] | null>(null)
    const issueId = state.status === 'ready' ? state.issue.id : null
    const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const onChangeRef = useRef(onIssueChange)
    useEffect(() => {
        onChangeRef.current = onIssueChange
    }, [onIssueChange])

    const loadIssue = useCallback(async () => {
        if (!issueRef) return
        const result = await getIssueAction(issueRef)
        if (!result.ok) {
            setState({ status: 'missing', message: errorText(result) })
            return
        }
        setState({ status: 'ready', issue: result.issue })
    }, [issueRef, errorText])

    const loadThread = useCallback(async (id: string) => {
        const [commentsResult, activityResult] = await Promise.all([listIssueCommentsAction(id), listIssueActivityAction(id)])
        if (commentsResult.ok) setComments(commentsResult.comments)
        if (activityResult.ok) setActivity(activityResult.events)
    }, [])

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setState({ status: 'loading' })
        setComments(null)
        setActivity(null)
        void loadIssue()
    }, [loadIssue])

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (issueId) void loadThread(issueId)
    }, [issueId, loadThread])

    useEffect(() => () => {
        if (refreshTimer.current) clearTimeout(refreshTimer.current)
    }, [])

    // A burst of changes (a coworker moving, commenting and releasing) reads the issue once.
    const scheduleRefresh = () => {
        if (refreshTimer.current) clearTimeout(refreshTimer.current)
        refreshTimer.current = setTimeout(() => {
            void loadIssue()
            if (issueId) void loadThread(issueId)
        }, REFRESH_DELAY_MS)
    }

    useRealtimeSubscription('issues', {
        channelId: `issue-${issueId}`,
        enabled: !!issueId,
        filter: issueId ? { column: 'id', value: issueId } : undefined,
        onUpdate: scheduleRefresh,
    })

    // Sub-issues are their own rows: a new child or a child's move shows in the list under its parent.
    useRealtimeSubscription('issues', {
        channelId: `issue-children-${issueId}`,
        enabled: !!issueId,
        filter: issueId ? { column: 'parent_issue_id', value: issueId } : undefined,
        onInsert: scheduleRefresh,
        onUpdate: scheduleRefresh,
    })

    // A coworker's run that failed before it took the issue changes nothing on the issue's row: its
    // failure arrives as an event of the log.
    useRealtimeSubscription('activity_events', {
        channelId: `issue-activity-${issueId}`,
        enabled: !!issueId,
        filter: issueId ? { column: 'issue_id', value: issueId } : undefined,
        onInsert: scheduleRefresh,
    })

    useRealtimeSubscription('issue_comments', {
        channelId: `issue-comments-${issueId}`,
        enabled: !!issueId,
        filter: issueId ? { column: 'issue_id', value: issueId } : undefined,
        onInsert: row => {
            const comment = issueCommentOfRow(row)
            setComments(current => (current && !current.some(existing => existing.id === comment.id) ? [...current, comment] : current))
            scheduleRefresh()
        },
        onUpdate: row => {
            const comment = issueCommentOfRow(row)
            setComments(current => current?.map(existing => (existing.id === comment.id ? comment : existing)) ?? current)
        },
    })

    const applySummary = (summary: IssueSummary) => {
        setState(current => (current.status === 'ready' && current.issue.id === summary.id ? { status: 'ready', issue: { ...current.issue, ...keepRunFailure(summary, current.issue) } } : current))
        onChangeRef.current?.(summary)
    }

    const run = async (write: () => Promise<{ ok: true; issue: IssueSummary } | { ok: false; error: string; code?: string }>): Promise<boolean> => {
        const result = await write()
        if (!result.ok) {
            toast.error(errorText(result))
            return false
        }
        applySummary(result.issue)
        scheduleRefresh()
        return true
    }

    const issue = state.status === 'ready' ? state.issue : null

    return {
        state,
        comments,
        activity,
        update: (input: UpdateIssueInput) => (issue ? run(() => updateIssueAction(issue.id, input)) : Promise.resolve(false)),
        setStatus: (status: IssueStatus, blockedReason?: string) => (issue ? run(() => transitionIssueAction(issue.id, status, blockedReason)) : Promise.resolve(false)),
        assign: (assignee: WorkMemberRef | null) => (issue ? run(() => assignIssueAction(issue.id, assignee)) : Promise.resolve(false)),
        createSubIssue: async (title: string) => {
            if (!issue) return false
            const result = await createSubIssueAction(issue.id, { title, status: 'todo' })
            if (!result.ok) {
                toast.error(errorText(result))
                return false
            }
            onChangeRef.current?.(result.issue)
            setState(current => (current.status === 'ready' ? { status: 'ready', issue: { ...current.issue, subIssues: [...current.issue.subIssues.filter(child => child.id !== result.issue.id), result.issue] } } : current))
            return true
        },
        addComment: async (body: string) => {
            if (!issue) return false
            const result = await addIssueCommentAction(issue.id, body)
            if (!result.ok) {
                toast.error(errorText(result))
                return false
            }
            setComments(current => (current?.some(existing => existing.id === result.comment.id) ? current : [...(current ?? []), result.comment]))
            scheduleRefresh()
            return true
        },
        editComment: async (commentId: string, body: string) => {
            const result = await editIssueCommentAction(commentId, body)
            if (!result.ok) {
                toast.error(errorText(result))
                return false
            }
            setComments(current => current?.map(existing => (existing.id === result.comment.id ? result.comment : existing)) ?? current)
            return true
        },
    }
}

export type IssueDetailController = ReturnType<typeof useIssueDetail>
