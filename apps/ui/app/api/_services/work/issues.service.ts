import 'server-only'

import {
    ISSUE_CHECKOUT_STATUSES,
    canTransitionIssue,
    createIssueInputSchema,
    formatIssueRef,
    isIssueClosed,
    issueListFiltersSchema,
    moveIssueInputSchema,
    parseIssueRef,
    updateIssueInputSchema,
    workMemberRefSchema,
    type CreateIssueInput,
    type IssueDetail,
    type IssueListFilters,
    type IssueStatus,
    type IssueSummary,
    type MoveIssueInput,
    type UpdateIssueInput,
    type WorkAuthor,
    type WorkMemberRef,
} from '@lumvika/contracts'

import { ISSUE_NOT_FOUND, PROJECT_NOT_FOUND } from '@/app/api/_auth/project-access'
import type { Database } from '@/app/api/database.types'
import { recordActivity } from '@/app/api/_services/work/activity.service'
import { reactToIssueChange } from '@/app/api/_services/work/issue-effects.service'
import { ISSUE_COLUMNS, ISSUE_SUMMARY_COLUMNS, type IssueRow } from '@/app/api/_services/work/columns'
import { toIssueDetail, toIssueSummary } from '@/app/api/_services/work/mappers'
import { assertMemberInWorkspace, authorColumns, clientOf, memberRefOf, parseWorkInput, sameMember, type WorkScope } from '@/app/api/_services/work/refs'
import { AppError } from '@/lib/i18n/action-error'
import { selectMany, selectManyWithJoins, selectMaybeSingle, selectMaybeSingleWithJoins, type Filters } from '@/supabase/supabase-helpers'

type IssueUpdate = Database['public']['Tables']['issues']['Update']

// An issue as the services hand it back: the row, and the reference people and agents call it by.
export type IssueRecord = IssueRow & { projectKey: string; ref: string }

// Room between two cards, so a drop between them rarely needs the column renumbered.
export const ISSUE_POSITION_STEP = 1024
const DEFAULT_LIST_LIMIT = 200
// Deep enough for any real tree; a longer chain is a loop in the making.
const MAX_PARENT_DEPTH = 50

const PROJECT_KEY_JOIN = { project: { table: 'projects', foreignKey: 'projects!issues_project_id_workspace_id_fkey', columns: ['key'] } } as const
const ISSUE_RETURNING = ISSUE_COLUMNS.join(',')

function recordOf(row: IssueRow, projectKey: string): IssueRecord {
    return { ...row, projectKey, ref: formatIssueRef(projectKey, row.number) }
}

async function findIssue(scope: WorkScope, issueId: string): Promise<IssueRecord | null> {
    const { data } = await selectMaybeSingleWithJoins(clientOf(scope), 'issues', ISSUE_COLUMNS, PROJECT_KEY_JOIN, { id: issueId, workspace_id: scope.workspaceId })
    if (!data) return null
    const { project, ...row } = data
    return recordOf(row, project.key)
}

async function readIssue(scope: WorkScope, issueId: string): Promise<IssueRecord> {
    const issue = await findIssue(scope, issueId)
    if (!issue) throw new AppError(ISSUE_NOT_FOUND)
    return issue
}

export async function getIssue(scope: WorkScope, issueId: string): Promise<IssueRecord | null> {
    return findIssue(scope, issueId)
}

// What moving an issue to `to` writes besides the status: the first start, the completion, the
// reason it is blocked, and the end of a checkout that only lives on a status an agent works in.
export function issueStatusPatch(issue: Pick<IssueRow, 'started_at' | 'completed_at' | 'blocked_reason' | 'checkout_run_id'>, to: IssueStatus, blockedReason: string | null | undefined, now: string): IssueUpdate {
    const patch: IssueUpdate = { status: to }
    if (to === 'in_progress' && !issue.started_at) patch.started_at = now
    if (isIssueClosed(to)) patch.completed_at = now
    else if (issue.completed_at) patch.completed_at = null
    if (to === 'blocked') patch.blocked_reason = blockedReason ?? issue.blocked_reason ?? null
    else if (issue.blocked_reason) patch.blocked_reason = null
    if (issue.checkout_run_id && !(ISSUE_CHECKOUT_STATUSES as readonly IssueStatus[]).includes(to)) {
        patch.checkout_run_id = null
        patch.checked_out_at = null
    }
    return patch
}

async function endOfColumn(scope: WorkScope, projectId: string, status: IssueStatus): Promise<number> {
    const { data } = await selectMany(clientOf(scope), 'issues', ['position'] as const, { project_id: projectId, status }, { column: 'position', ascending: false }, 1)
    return (data?.[0]?.position ?? 0) + ISSUE_POSITION_STEP
}

async function assertGoal(scope: WorkScope, goalId: string | null | undefined): Promise<void> {
    if (!goalId) return
    const { data } = await selectMaybeSingle(clientOf(scope), 'goals', ['id'] as const, { id: goalId, workspace_id: scope.workspaceId })
    if (!data) throw new AppError('goalNotFound')
}

// A parent lives in the same project, and the issue is never its own ancestor.
async function assertParent(scope: WorkScope, projectId: string, parentIssueId: string | null | undefined, issueId?: string): Promise<void> {
    if (!parentIssueId) return
    if (parentIssueId === issueId) throw new AppError('issueParentInvalid')
    const supabase = clientOf(scope)
    let cursor: string | null = parentIssueId
    for (let depth = 0; cursor && depth < MAX_PARENT_DEPTH; depth++) {
        const { data: ancestor }: { data: Pick<IssueRow, 'id' | 'project_id' | 'parent_issue_id'> | null } = await selectMaybeSingle(supabase, 'issues', ['id', 'project_id', 'parent_issue_id'] as const, { id: cursor, workspace_id: scope.workspaceId })
        if (!ancestor || ancestor.project_id !== projectId) throw new AppError('issueParentInvalid')
        if (issueId && ancestor.parent_issue_id === issueId) throw new AppError('issueParentInvalid')
        if (!issueId) return
        cursor = ancestor.parent_issue_id
    }
    if (cursor) throw new AppError('issueParentInvalid')
}

function assigneeColumns(assignee: WorkMemberRef | null): Pick<IssueUpdate, 'assignee_user_id' | 'assignee_agent_id'> {
    const columns = authorColumns(assignee)
    return { assignee_user_id: columns.userId, assignee_agent_id: columns.agentId }
}

// Every write of a status is conditional on the status read just before it: two people dragging the
// same card cannot slip a transition past the matrix.
async function writeIssue(scope: WorkScope, current: IssueRecord, patch: IssueUpdate, options: { expectStatus?: boolean } = {}): Promise<IssueRecord> {
    let query = clientOf(scope).from('issues').update<IssueUpdate>(patch).eq('id', current.id).eq('workspace_id', scope.workspaceId)
    if (options.expectStatus) query = query.eq('status', current.status)
    const { data, error } = await query.select(ISSUE_RETURNING).maybeSingle<IssueRow>()
    if (error) throw new Error(`Failed to update the issue: ${error.message}`)
    if (!data) throw new AppError('issueChangedMeanwhile')
    return recordOf(data, current.projectKey)
}

export async function createIssue(scope: WorkScope, author: WorkAuthor, input: CreateIssueInput): Promise<IssueRecord> {
    const fields = parseWorkInput(createIssueInputSchema, input)
    const supabase = clientOf(scope)
    const { data: project } = await selectMaybeSingle(supabase, 'projects', ['id', 'key', 'archived_at'] as const, { id: fields.projectId, workspace_id: scope.workspaceId })
    if (!project) throw new AppError(PROJECT_NOT_FOUND)
    if (project.archived_at) throw new AppError('projectArchived')
    if (fields.assignee) await assertMemberInWorkspace(scope, fields.assignee)
    await assertParent(scope, project.id, fields.parentIssueId)
    await assertGoal(scope, fields.goalId)

    const status = fields.status ?? 'backlog'
    const now = new Date().toISOString()
    const creator = authorColumns(author)
    const { data, error } = await supabase
        .from('issues')
        .insert<Database['public']['Tables']['issues']['Insert']>({
            workspace_id: scope.workspaceId,
            project_id: project.id,
            title: fields.title,
            description: fields.description ?? null,
            status,
            priority: fields.priority ?? 'none',
            ...assigneeColumns(fields.assignee ?? null),
            created_by_user_id: creator.userId,
            created_by_agent_id: creator.agentId,
            parent_issue_id: fields.parentIssueId ?? null,
            goal_id: fields.goalId ?? null,
            due_date: fields.dueDate ?? null,
            position: await endOfColumn(scope, project.id, status),
            started_at: status === 'in_progress' ? now : null,
            completed_at: isIssueClosed(status) ? now : null,
        })
        .select(ISSUE_RETURNING)
        .single<IssueRow>()
    if (error || !data) throw new Error(`Failed to create the issue: ${error?.message}`)

    const issue = recordOf(data, project.key)
    await recordActivity(scope, {
        action: 'issue.created',
        entityType: 'issue',
        entityId: issue.id,
        projectId: issue.project_id,
        issueId: issue.id,
        author,
        metadata: { ref: issue.ref, title: issue.title, status, parentIssueId: issue.parent_issue_id },
    })
    reactToIssueChange(scope, { kind: 'created', issueId: issue.id, author })
    return issue
}

export async function createSubIssue(scope: WorkScope, author: WorkAuthor, parentIssueId: string, input: Omit<CreateIssueInput, 'projectId' | 'parentIssueId'>): Promise<IssueRecord> {
    const parent = await readIssue(scope, parentIssueId)
    return createIssue(scope, author, { ...input, projectId: parent.project_id, parentIssueId: parent.id })
}

export async function updateIssue(scope: WorkScope, author: WorkAuthor, issueId: string, input: UpdateIssueInput): Promise<IssueRecord> {
    const fields = parseWorkInput(updateIssueInputSchema, input)
    const current = await readIssue(scope, issueId)
    if (fields.parentIssueId !== undefined) await assertParent(scope, current.project_id, fields.parentIssueId, current.id)
    await assertGoal(scope, fields.goalId)

    const patch: IssueUpdate = {
        ...(fields.title !== undefined ? { title: fields.title } : {}),
        ...(fields.description !== undefined ? { description: fields.description } : {}),
        ...(fields.priority !== undefined ? { priority: fields.priority } : {}),
        ...(fields.parentIssueId !== undefined ? { parent_issue_id: fields.parentIssueId } : {}),
        ...(fields.goalId !== undefined ? { goal_id: fields.goalId } : {}),
        ...(fields.dueDate !== undefined ? { due_date: fields.dueDate } : {}),
        ...(fields.blockedReason !== undefined ? { blocked_reason: fields.blockedReason } : {}),
    }
    const changed = Object.keys(patch)
    if (changed.length === 0) return current

    const issue = await writeIssue(scope, current, patch)
    await recordActivity(scope, { action: 'issue.updated', entityType: 'issue', entityId: issue.id, projectId: issue.project_id, issueId: issue.id, author, metadata: { ref: issue.ref, fields: changed } })
    return issue
}

async function changeStatus(scope: WorkScope, author: WorkAuthor, current: IssueRecord, to: IssueStatus, extra: { blockedReason?: string | null; position?: number }): Promise<IssueRecord> {
    if (!canTransitionIssue(current.status, to)) throw new AppError('issueTransitionNotAllowed')
    const position = extra.position ?? (await endOfColumn(scope, current.project_id, to))
    const patch = { ...issueStatusPatch(current, to, extra.blockedReason, new Date().toISOString()), position }
    const issue = await writeIssue(scope, current, patch, { expectStatus: true })
    await recordActivity(scope, {
        action: 'issue.status_changed',
        entityType: 'issue',
        entityId: issue.id,
        projectId: issue.project_id,
        issueId: issue.id,
        author,
        metadata: { ref: issue.ref, from: current.status, to },
    })
    reactToIssueChange(scope, { kind: 'status', issueId: issue.id, from: current.status, author })
    return issue
}

// Staying in the same status is a no-op, not a refusal: an agent may report "in progress" twice.
export async function transitionIssue(scope: WorkScope, author: WorkAuthor, issueId: string, to: IssueStatus, options: { blockedReason?: string | null } = {}): Promise<IssueRecord> {
    const current = await readIssue(scope, issueId)
    if (current.status === to) return current
    return changeStatus(scope, author, current, to, { blockedReason: options.blockedReason })
}

// A drop on the board: a new column goes through the matrix, a new place in the same column is
// presentation only and leaves no activity behind.
export async function moveIssue(scope: WorkScope, author: WorkAuthor, issueId: string, input: MoveIssueInput): Promise<IssueRecord> {
    const move = parseWorkInput(moveIssueInputSchema, input)
    const current = await readIssue(scope, issueId)
    if (move.status !== current.status) return changeStatus(scope, author, current, move.status, { position: move.position })
    if (move.position === current.position) return current
    return writeIssue(scope, current, { position: move.position }, { expectStatus: true })
}

// One assignee at most. A new assignee ends the checkout of the previous one's run.
export async function assignIssue(scope: WorkScope, author: WorkAuthor, issueId: string, assignee: WorkMemberRef | null): Promise<IssueRecord> {
    const target = assignee ? parseWorkInput(workMemberRefSchema, assignee) : null
    const current = await readIssue(scope, issueId)
    const previous = memberRefOf(current.assignee_user_id, current.assignee_agent_id)
    if (sameMember(previous, target)) return current
    if (target) await assertMemberInWorkspace(scope, target)

    const patch: IssueUpdate = { ...assigneeColumns(target), ...(current.checkout_run_id ? { checkout_run_id: null, checked_out_at: null } : {}) }
    const issue = await writeIssue(scope, current, patch)
    await recordActivity(scope, {
        action: target ? 'issue.assigned' : 'issue.unassigned',
        entityType: 'issue',
        entityId: issue.id,
        projectId: issue.project_id,
        issueId: issue.id,
        author,
        metadata: { ref: issue.ref, assignee: target, previous },
    })
    if (target) reactToIssueChange(scope, { kind: 'assigned', issueId: issue.id, author })
    return issue
}

export type CheckoutConflict = 'not_found' | 'not_assigned' | 'not_ready' | 'checked_out'
export type CheckoutResult = { ok: true; issue: IssueRecord } | { ok: false; reason: CheckoutConflict; heldByRunId: string | null }

// An agent run takes the issue it is about to work on. One conditional update decides it, so two runs
// racing for the same issue cannot both win: it must be assigned to this agent, on a status an agent
// works in, and held by no run. The same run asking again gets it back.
export async function checkoutIssue(scope: WorkScope, issueId: string, agentId: string, runId: string, options: { sessionId?: string | null } = {}): Promise<CheckoutResult> {
    const supabase = clientOf(scope)
    const now = new Date().toISOString()
    const { data, error } = await supabase
        .from('issues')
        .update<IssueUpdate>({ status: 'in_progress', checkout_run_id: runId, checked_out_at: now, blocked_reason: null, completed_at: null, ...(options.sessionId !== undefined ? { session_id: options.sessionId } : {}) })
        .eq('id', issueId)
        .eq('workspace_id', scope.workspaceId)
        .eq('assignee_agent_id', agentId)
        .in('status', [...ISSUE_CHECKOUT_STATUSES])
        .is('checkout_run_id', null)
        .select(ISSUE_RETURNING)
        .maybeSingle<IssueRow>()
    if (error) throw new Error(`Failed to check out the issue: ${error.message}`)

    if (!data) {
        const current = await findIssue(scope, issueId)
        if (!current) return { ok: false, reason: 'not_found', heldByRunId: null }
        if (current.assignee_agent_id !== agentId) return { ok: false, reason: 'not_assigned', heldByRunId: current.checkout_run_id }
        if (current.checkout_run_id === runId) return { ok: true, issue: current }
        if (current.checkout_run_id) return { ok: false, reason: 'checked_out', heldByRunId: current.checkout_run_id }
        return { ok: false, reason: 'not_ready', heldByRunId: null }
    }

    let row = data
    if (!row.started_at) {
        const { data: stamped } = await supabase.from('issues').update<IssueUpdate>({ started_at: now }).eq('id', issueId).is('started_at', null).select(ISSUE_RETURNING).maybeSingle<IssueRow>()
        if (stamped) row = stamped
    }
    const { data: project } = await selectMaybeSingle(supabase, 'projects', ['key'] as const, { id: row.project_id })
    const issue = recordOf(row, project?.key ?? '')
    await recordActivity(scope, { action: 'issue.checked_out', entityType: 'issue', entityId: issue.id, projectId: issue.project_id, issueId: issue.id, author: { kind: 'agent', agentId }, metadata: { ref: issue.ref, runId } })
    return { ok: true, issue }
}

export type ReleaseResult = { ok: true; issue: IssueRecord } | { ok: false; reason: 'not_found' | 'not_checked_out' }

// The run lets go of the issue (its status stays where the run left it). Without `runId`, whoever
// holds it is let go: a person freeing an issue a crashed run kept.
export async function releaseIssue(scope: WorkScope, author: WorkAuthor, issueId: string, options: { runId?: string } = {}): Promise<ReleaseResult> {
    let query = clientOf(scope).from('issues').update<IssueUpdate>({ checkout_run_id: null, checked_out_at: null }).eq('id', issueId).eq('workspace_id', scope.workspaceId)
    query = options.runId ? query.eq('checkout_run_id', options.runId) : query.not('checkout_run_id', 'is', null)
    const { data, error } = await query.select(ISSUE_RETURNING).maybeSingle<IssueRow>()
    if (error) throw new Error(`Failed to release the issue: ${error.message}`)
    if (!data) {
        const current = await findIssue(scope, issueId)
        return { ok: false, reason: current ? 'not_checked_out' : 'not_found' }
    }
    const { data: project } = await selectMaybeSingle(clientOf(scope), 'projects', ['key'] as const, { id: data.project_id })
    const issue = recordOf(data, project?.key ?? '')
    await recordActivity(scope, { action: 'issue.released', entityType: 'issue', entityId: issue.id, projectId: issue.project_id, issueId: issue.id, author, metadata: { ref: issue.ref, runId: options.runId ?? null } })
    return { ok: true, issue }
}

function likePattern(text: string): string {
    return `%${text.replace(/[\\%_]/g, char => `\\${char}`)}%`
}

const SORTS = {
    position: { column: 'position', ascending: true },
    updated: { column: 'updated_at', ascending: false },
    created: { column: 'created_at', ascending: false },
} as const

// `visibleProjects` comes from `visibleProjectIds(actor)`: an issue of a project the actor cannot see
// is never listed, whatever the filters.
export async function listIssues(scope: WorkScope, input: IssueListFilters, visibleProjects: 'all' | Set<string>): Promise<IssueSummary[]> {
    const filters = parseWorkInput(issueListFiltersSchema, input)
    if (filters.projectId && visibleProjects !== 'all' && !visibleProjects.has(filters.projectId)) return []
    const projectScope = filters.projectId ?? (visibleProjects === 'all' ? undefined : [...visibleProjects])
    if (Array.isArray(projectScope) && projectScope.length === 0) return []

    const assignee = filters.assignee
    const createdBy = filters.createdBy
    const query: Filters<'issues'> = {
        workspace_id: scope.workspaceId,
        project_id: projectScope,
        status: filters.status?.length ? filters.status : undefined,
        assignee_user_id: assignee === 'unassigned' ? { isNull: true } : assignee?.kind === 'user' ? assignee.userId : filters.assigneeKind === 'user' ? { notNull: true } : undefined,
        assignee_agent_id: assignee === 'unassigned' ? { isNull: true } : assignee?.kind === 'agent' ? assignee.agentId : filters.assigneeKind === 'agent' ? { notNull: true } : undefined,
        created_by_user_id: createdBy?.kind === 'user' ? createdBy.userId : undefined,
        created_by_agent_id: createdBy?.kind === 'agent' ? createdBy.agentId : undefined,
        parent_issue_id: filters.parentIssueId === null ? { isNull: true } : filters.parentIssueId,
        or: filters.text ? { title: { ilike: likePattern(filters.text) }, description: { ilike: likePattern(filters.text) } } : undefined,
    }
    const { data, error } = await selectManyWithJoins(clientOf(scope), 'issues', ISSUE_SUMMARY_COLUMNS, PROJECT_KEY_JOIN, query, undefined, SORTS[filters.sort ?? 'position'], filters.limit ?? DEFAULT_LIST_LIMIT, filters.offset)
    if (error) throw new Error(`Failed to list the issues: ${error.message}`)
    return (data ?? []).map(({ project, ...row }) => toIssueSummary(row, project.key))
}

// Null when the reference names nothing or a project the actor cannot see: both read the same way.
export async function getIssueByRef(scope: WorkScope, ref: string, visibleProjects: 'all' | Set<string>): Promise<IssueDetail | null> {
    const parsed = parseIssueRef(ref)
    if (!parsed) return null
    const supabase = clientOf(scope)
    const { data: project } = await selectMaybeSingle(supabase, 'projects', ['id', 'key'] as const, { workspace_id: scope.workspaceId, key: parsed.projectKey })
    if (!project || (visibleProjects !== 'all' && !visibleProjects.has(project.id))) return null
    const { data: issue } = await selectMaybeSingle(supabase, 'issues', ISSUE_COLUMNS, { project_id: project.id, number: parsed.number })
    if (!issue) return null
    const { data: children } = await selectMany(supabase, 'issues', ISSUE_SUMMARY_COLUMNS, { parent_issue_id: issue.id }, { column: 'position', ascending: true })
    return toIssueDetail(
        issue,
        project.key,
        (children ?? []).map(child => toIssueSummary(child, project.key)),
    )
}
