import 'server-only'

import { formatIssueRef, type WorkAuthor } from '@lumvika/contracts'

import { getIssue, listIssues, transitionIssue, type IssueRecord } from '@/app/api/_services/work/issues.service'
import { addIssueComment } from '@/app/api/_services/work/issue-comments.service'
import { readVisibleProjects } from '@/app/api/_services/work/my-work.service'
import { authorOf, clientOf, type WorkScope } from '@/app/api/_services/work/refs'
import { AppError } from '@/lib/i18n/action-error'
import { buildReviewQueue, type ReviewQueue } from '@/lib/work/review-queue'
import { selectAll, selectMany } from '@/supabase/supabase-helpers'

// Enough for any real queue, and short enough for the ids of its issues to fit one request.
const QUEUE_LIMIT = 200

// What waits on a person in the projects the caller sees: the issues a coworker or a teammate handed
// back for review, and the blocked ones, each with who put it there, when, and its last comment.
export async function listReviewQueue(scope: WorkScope, userId: string, visibleProjects: 'all' | Set<string>): Promise<ReviewQueue> {
    const [projects, issues] = await Promise.all([readVisibleProjects(scope, visibleProjects), listIssues(scope, { status: ['in_review', 'blocked'], sort: 'updated', limit: QUEUE_LIMIT }, visibleProjects)])
    if (issues.length === 0) return { toReview: [], blocked: [] }

    const supabase = clientOf(scope)
    const ids = issues.map(issue => issue.id)
    const [facts, comments, changes] = await Promise.all([
        selectAll(supabase, 'issues', ['id', 'created_by_user_id', 'blocked_reason'] as const, { workspace_id: scope.workspaceId, id: ids }),
        selectAll(supabase, 'issue_comments', ['issue_id', 'author_user_id', 'author_agent_id', 'body', 'created_at'] as const, { workspace_id: scope.workspaceId, issue_id: ids }, { column: 'created_at', ascending: false }),
        selectAll(supabase, 'activity_events', ['issue_id', 'actor_user_id', 'actor_agent_id', 'metadata', 'created_at'] as const, { workspace_id: scope.workspaceId, issue_id: ids, action: 'issue.status_changed' }, { column: 'created_at', ascending: false }),
    ])
    if (facts.error) throw new Error(`Failed to read the queued issues: ${facts.error.message}`)
    if (comments.error) throw new Error(`Failed to read the comments: ${comments.error.message}`)
    if (changes.error) throw new Error(`Failed to read the status changes: ${changes.error.message}`)

    return buildReviewQueue(
        {
            issues,
            projects,
            facts: (facts.data ?? []).map(row => ({ id: row.id, createdByUserId: row.created_by_user_id, blockedReason: row.blocked_reason })),
            comments: (comments.data ?? []).map(row => ({ issueId: row.issue_id, author: authorOf(row.author_user_id, row.author_agent_id), body: row.body, createdAt: row.created_at })),
            statusChanges: (changes.data ?? []).flatMap(row => {
                if (!row.issue_id) return []
                const metadata = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? row.metadata : {}
                return [{ issueId: row.issue_id, actor: authorOf(row.actor_user_id, row.actor_agent_id), to: typeof metadata.to === 'string' ? metadata.to : null, createdAt: row.created_at }]
            }),
        },
        userId,
    )
}

// A coworker conversation waiting on a person and the issue it works on, for the conversations the
// Review screen lists: the person answers in the conversation and sees which issue it is about.
export type ConversationIssue = { sessionId: string; ref: string; title: string }

export async function issuesOfConversations(scope: WorkScope, sessionIds: readonly string[], visibleProjects: 'all' | Set<string>): Promise<ConversationIssue[]> {
    const ids = [...new Set(sessionIds)].slice(0, QUEUE_LIMIT)
    if (ids.length === 0) return []
    const supabase = clientOf(scope)
    const { data: issues, error } = await selectMany(supabase, 'issues', ['session_id', 'project_id', 'number', 'title'] as const, { workspace_id: scope.workspaceId, session_id: ids })
    if (error) throw new Error(`Failed to read the issues of the conversations: ${error.message}`)
    const seen = (issues ?? []).filter(issue => visibleProjects === 'all' || visibleProjects.has(issue.project_id))
    if (seen.length === 0) return []
    const { data: projects } = await selectMany(supabase, 'projects', ['id', 'key'] as const, { workspace_id: scope.workspaceId, id: [...new Set(seen.map(issue => issue.project_id))] })
    const keyOf = new Map((projects ?? []).map(project => [project.id, project.key]))
    return seen.flatMap(issue => (issue.session_id && keyOf.has(issue.project_id) ? [{ sessionId: issue.session_id, ref: formatIssueRef(keyOf.get(issue.project_id)!, issue.number), title: issue.title }] : []))
}

type Verdict = { issueId: string; author: WorkAuthor }

async function assertStatus(scope: WorkScope, issueId: string, status: 'in_review' | 'blocked'): Promise<void> {
    const issue = await getIssue(scope, issueId)
    if (!issue) throw new AppError('issueNotFound')
    if (issue.status !== status) throw new AppError(status === 'in_review' ? 'issueNoLongerInReview' : 'issueNoLongerBlocked')
}

export async function approveIssue(scope: WorkScope, { issueId, author }: Verdict): Promise<IssueRecord> {
    await assertStatus(scope, issueId, 'in_review')
    return transitionIssue(scope, author, issueId, 'done')
}

// The comment says what to change: it is posted before the issue goes back to work, so the coworker
// it wakes reads it on its first look.
export async function requestChanges(scope: WorkScope, { issueId, author }: Verdict, comment: string): Promise<IssueRecord> {
    await assertStatus(scope, issueId, 'in_review')
    await addIssueComment(scope, author, issueId, { body: comment })
    return transitionIssue(scope, author, issueId, 'in_progress')
}

export async function unblockIssue(scope: WorkScope, { issueId, author }: Verdict, comment?: string | null): Promise<IssueRecord> {
    await assertStatus(scope, issueId, 'blocked')
    if (comment?.trim()) await addIssueComment(scope, author, issueId, { body: comment })
    return transitionIssue(scope, author, issueId, 'todo')
}

