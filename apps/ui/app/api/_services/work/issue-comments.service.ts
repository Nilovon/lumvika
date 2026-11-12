import 'server-only'

import { createIssueCommentInputSchema, editIssueCommentInputSchema, type CreateIssueCommentInput, type EditIssueCommentInput, type IssueComment, type WorkAuthor } from '@lumvika/contracts'

import { ISSUE_NOT_FOUND } from '@/app/api/_auth/project-access'
import type { Database } from '@/app/api/database.types'
import { recordActivity } from '@/app/api/_services/work/activity.service'
import { ISSUE_COMMENT_COLUMNS, type IssueCommentRow } from '@/app/api/_services/work/columns'
import { toIssueComment } from '@/app/api/_services/work/mappers'
import { authorColumns, clientOf, parseWorkInput, type WorkScope } from '@/app/api/_services/work/refs'
import { AppError } from '@/lib/i18n/action-error'
import { selectAll, selectMaybeSingle } from '@/supabase/supabase-helpers'

const COMMENT_RETURNING = ISSUE_COMMENT_COLUMNS.join(',')

export async function addIssueComment(scope: WorkScope, author: WorkAuthor, issueId: string, input: CreateIssueCommentInput): Promise<IssueComment> {
    const { body } = parseWorkInput(createIssueCommentInputSchema, input)
    const supabase = clientOf(scope)
    const { data: issue } = await selectMaybeSingle(supabase, 'issues', ['id', 'project_id'] as const, { id: issueId, workspace_id: scope.workspaceId })
    if (!issue) throw new AppError(ISSUE_NOT_FOUND)

    const writer = authorColumns(author)
    const { data, error } = await supabase
        .from('issue_comments')
        .insert<Database['public']['Tables']['issue_comments']['Insert']>({ workspace_id: scope.workspaceId, issue_id: issue.id, author_user_id: writer.userId, author_agent_id: writer.agentId, body })
        .select(COMMENT_RETURNING)
        .single<IssueCommentRow>()
    if (error || !data) throw new Error(`Failed to add the comment: ${error?.message}`)

    await recordActivity(scope, { action: 'issue.commented', entityType: 'issue_comment', entityId: data.id, projectId: issue.project_id, issueId: issue.id, author, metadata: { excerpt: body.slice(0, 200) } })
    return toIssueComment(data)
}

// Only the one who wrote it rewrites a comment, a person or an agent alike.
export async function editIssueComment(scope: WorkScope, author: WorkAuthor, commentId: string, input: EditIssueCommentInput): Promise<IssueComment> {
    const { body } = parseWorkInput(editIssueCommentInputSchema, input)
    const supabase = clientOf(scope)
    const { data: comment } = await selectMaybeSingle(supabase, 'issue_comments', ['id', 'issue_id', 'author_user_id', 'author_agent_id', 'body'] as const, { id: commentId, workspace_id: scope.workspaceId })
    if (!comment) throw new AppError('commentNotFound')
    const writer = authorColumns(author)
    const isAuthor = author.kind !== 'system' && writer.userId === comment.author_user_id && writer.agentId === comment.author_agent_id
    if (!isAuthor) throw new AppError('commentAuthorOnly')

    const { data, error } = await supabase
        .from('issue_comments')
        .update<Database['public']['Tables']['issue_comments']['Update']>({ body, edited_at: new Date().toISOString() })
        .eq('id', comment.id)
        .eq('workspace_id', scope.workspaceId)
        .select(COMMENT_RETURNING)
        .single<IssueCommentRow>()
    if (error || !data) throw new Error(`Failed to edit the comment: ${error?.message}`)

    const { data: issue } = await selectMaybeSingle(supabase, 'issues', ['project_id'] as const, { id: comment.issue_id })
    await recordActivity(scope, { action: 'issue.comment_edited', entityType: 'issue_comment', entityId: data.id, projectId: issue?.project_id ?? null, issueId: comment.issue_id, author })
    return toIssueComment(data)
}

export async function listIssueComments(scope: WorkScope, issueId: string): Promise<IssueComment[]> {
    const { data, error } = await selectAll(clientOf(scope), 'issue_comments', ISSUE_COMMENT_COLUMNS, { issue_id: issueId, workspace_id: scope.workspaceId }, { column: 'created_at', ascending: true })
    if (error) throw new Error(`Failed to list the comments: ${error.message}`)
    return (data ?? []).map(toIssueComment)
}
