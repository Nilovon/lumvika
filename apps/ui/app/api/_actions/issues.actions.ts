'use server'

import {
    SYSTEM_AUTHOR,
    type ActivityEvent,
    type CreateIssueInput,
    type IssueComment,
    type IssueDetail,
    type IssueStatus,
    type IssueSummary,
    type MoveIssueInput,
    type UpdateIssueInput,
    type WorkAuthor,
    type WorkMemberRef,
} from '@lumvika/contracts'

import { requireLightSessionActor, type Actor } from '@/app/api/_auth/access'
import { assertIssueAccess, assertProjectAccess, ISSUE_NOT_FOUND, visibleProjectIds } from '@/app/api/_auth/project-access'
import { listActivity } from '@/app/api/_services/work/activity.service'
import { addIssueComment, editIssueComment, listIssueComments } from '@/app/api/_services/work/issue-comments.service'
import { assignIssue, createIssue, createSubIssue, getIssueByRef, listProjectBoard, moveIssue, transitionIssue, updateIssue, type IssueRecord, type ProjectBoard } from '@/app/api/_services/work/issues.service'
import { toIssueSummary } from '@/app/api/_services/work/mappers'
import { assertAssignableBy } from '@/app/api/_services/work/refs'
import { selectMaybeSingle, serviceScope } from '@/lib/db'
import { failure, failureOf } from '@/lib/i18n/action-error'
import type { ActionResult } from './space.actions'

const ISSUE_ACTIVITY_LIMIT = 100

type IssueResult = ActionResult<{ issue: IssueSummary }>

function authorOf(actor: Actor): WorkAuthor {
    return actor.kind === 'user' ? { kind: 'user', userId: actor.userId } : SYSTEM_AUTHOR
}

function scopeOf(actor: Actor) {
    return { workspaceId: actor.workspaceId }
}

function summaryOf(record: IssueRecord): IssueSummary {
    return toIssueSummary(record, record.projectKey)
}

// The issues of a project, sub-issues included, column by column: each column up to its limit (raised
// by Show more), with how many it holds in all.
export async function listProjectIssuesAction(projectId: string, limits: Partial<Record<IssueStatus, number>> = {}): Promise<ActionResult<ProjectBoard>> {
    try {
        const { actor } = await assertProjectAccess(projectId, 'use')
        const board = await listProjectBoard(scopeOf(actor), projectId, limits)
        return { ok: true, ...board }
    } catch (err) {
        return failureOf(err)
    }
}

export async function getIssueAction(ref: string): Promise<ActionResult<{ issue: IssueDetail }>> {
    try {
        const actor = await requireLightSessionActor()
        const issue = await getIssueByRef(scopeOf(actor), ref, await visibleProjectIds(actor))
        if (!issue) return failure(ISSUE_NOT_FOUND)
        return { ok: true, issue }
    } catch (err) {
        return failureOf(err)
    }
}

export async function createIssueAction(input: CreateIssueInput): Promise<IssueResult> {
    try {
        const { actor } = await assertProjectAccess(input.projectId, 'use')
        await assertAssignableBy(actor, input.assignee)
        const issue = await createIssue(scopeOf(actor), authorOf(actor), input)
        return { ok: true, issue: summaryOf(issue) }
    } catch (err) {
        return failureOf(err)
    }
}

export async function createSubIssueAction(parentIssueId: string, input: Omit<CreateIssueInput, 'projectId' | 'parentIssueId'>): Promise<IssueResult> {
    try {
        const { actor } = await assertIssueAccess(parentIssueId, 'use')
        await assertAssignableBy(actor, input.assignee)
        const issue = await createSubIssue(scopeOf(actor), authorOf(actor), parentIssueId, input)
        return { ok: true, issue: summaryOf(issue) }
    } catch (err) {
        return failureOf(err)
    }
}

export async function updateIssueAction(issueId: string, input: UpdateIssueInput): Promise<IssueResult> {
    try {
        const { actor } = await assertIssueAccess(issueId, 'use')
        const issue = await updateIssue(scopeOf(actor), authorOf(actor), issueId, input)
        return { ok: true, issue: summaryOf(issue) }
    } catch (err) {
        return failureOf(err)
    }
}

export async function transitionIssueAction(issueId: string, status: IssueStatus, blockedReason?: string | null): Promise<IssueResult> {
    try {
        const { actor } = await assertIssueAccess(issueId, 'use')
        const issue = await transitionIssue(scopeOf(actor), authorOf(actor), issueId, status, { blockedReason })
        return { ok: true, issue: summaryOf(issue) }
    } catch (err) {
        return failureOf(err)
    }
}

export async function moveIssueAction(issueId: string, input: MoveIssueInput): Promise<IssueResult> {
    try {
        const { actor } = await assertIssueAccess(issueId, 'use')
        const issue = await moveIssue(scopeOf(actor), authorOf(actor), issueId, input)
        return { ok: true, issue: summaryOf(issue) }
    } catch (err) {
        return failureOf(err)
    }
}

export async function assignIssueAction(issueId: string, assignee: WorkMemberRef | null): Promise<IssueResult> {
    try {
        const { actor } = await assertIssueAccess(issueId, 'use')
        await assertAssignableBy(actor, assignee)
        const issue = await assignIssue(scopeOf(actor), authorOf(actor), issueId, assignee)
        return { ok: true, issue: summaryOf(issue) }
    } catch (err) {
        return failureOf(err)
    }
}

export async function listIssueCommentsAction(issueId: string): Promise<ActionResult<{ comments: IssueComment[] }>> {
    try {
        const { actor } = await assertIssueAccess(issueId, 'use')
        const comments = await listIssueComments(scopeOf(actor), issueId)
        return { ok: true, comments }
    } catch (err) {
        return failureOf(err)
    }
}

export async function addIssueCommentAction(issueId: string, body: string): Promise<ActionResult<{ comment: IssueComment }>> {
    try {
        const { actor } = await assertIssueAccess(issueId, 'use')
        const comment = await addIssueComment(scopeOf(actor), authorOf(actor), issueId, { body })
        return { ok: true, comment }
    } catch (err) {
        return failureOf(err)
    }
}

// The comment names its issue, and the issue its project: access is asserted on that project.
export async function editIssueCommentAction(commentId: string, body: string): Promise<ActionResult<{ comment: IssueComment }>> {
    try {
        const actor = await requireLightSessionActor()
        const { data: row } = await selectMaybeSingle(serviceScope(), 'issue_comments', ['issue_id'] as const, { id: commentId, workspace_id: actor.workspaceId })
        if (!row) return failure('commentNotFound')
        await assertIssueAccess(row.issue_id, 'use', actor)
        const comment = await editIssueComment(scopeOf(actor), authorOf(actor), commentId, { body })
        return { ok: true, comment }
    } catch (err) {
        return failureOf(err)
    }
}

// Newest first, as the log is kept.
export async function listIssueActivityAction(issueId: string): Promise<ActionResult<{ events: ActivityEvent[] }>> {
    try {
        const { actor, project } = await assertIssueAccess(issueId, 'use')
        const { events } = await listActivity(scopeOf(actor), { issueId, limit: ISSUE_ACTIVITY_LIMIT }, new Set([project.id]))
        return { ok: true, events }
    } catch (err) {
        return failureOf(err)
    }
}
