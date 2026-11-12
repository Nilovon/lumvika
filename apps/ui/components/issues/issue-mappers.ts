import type { Tables } from '@/app/api/database.types'
import { formatIssueRef, type IssueComment, type IssueSummary, type WorkAuthor, type WorkMemberRef } from '@lumvika/contracts'

type IssueSummaryFields = Pick<
    Tables<'issues'>,
    | 'id'
    | 'project_id'
    | 'number'
    | 'title'
    | 'status'
    | 'priority'
    | 'assignee_user_id'
    | 'assignee_agent_id'
    | 'parent_issue_id'
    | 'goal_id'
    | 'due_date'
    | 'position'
    | 'checkout_run_id'
    | 'checked_out_at'
    | 'started_at'
    | 'completed_at'
    | 'created_at'
    | 'updated_at'
>

function memberOf(userId: string | null, agentId: string | null): WorkMemberRef | null {
    if (userId) return { kind: 'user', userId }
    if (agentId) return { kind: 'agent', agentId }
    return null
}

// A row the realtime feed brings, read the way the server's mappers read it: the board applies it
// at once instead of asking the server again.
export function issueSummaryOfRow(row: IssueSummaryFields, projectKey: string): IssueSummary {
    return {
        id: row.id,
        projectId: row.project_id,
        number: row.number,
        ref: formatIssueRef(projectKey, row.number),
        title: row.title,
        status: row.status,
        priority: row.priority,
        assignee: memberOf(row.assignee_user_id, row.assignee_agent_id),
        parentIssueId: row.parent_issue_id,
        goalId: row.goal_id,
        dueDate: row.due_date,
        position: row.position,
        checkoutRunId: row.checkout_run_id,
        checkedOutAt: row.checked_out_at,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    }
}

export function issueCommentOfRow(row: Pick<Tables<'issue_comments'>, 'id' | 'issue_id' | 'author_user_id' | 'author_agent_id' | 'body' | 'edited_at' | 'created_at'>): IssueComment {
    const author: WorkAuthor = memberOf(row.author_user_id, row.author_agent_id) ?? { kind: 'system' }
    return { id: row.id, issueId: row.issue_id, author, body: row.body, editedAt: row.edited_at, createdAt: row.created_at }
}

export function sameMember(a: WorkMemberRef | WorkAuthor | null, b: WorkMemberRef | WorkAuthor | null): boolean {
    if (!a || !b) return a === b
    if (a.kind === 'user' && b.kind === 'user') return a.userId === b.userId
    if (a.kind === 'agent' && b.kind === 'agent') return a.agentId === b.agentId
    return a.kind === 'system' && b.kind === 'system'
}
