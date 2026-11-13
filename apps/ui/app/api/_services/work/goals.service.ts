import 'server-only'

import { createGoalInputSchema, updateGoalInputSchema, type CreateGoalInput, type Goal, type IssueCounts, type IssueStatus, type UpdateGoalInput, type WorkAuthor } from '@lumvika/contracts'

import type { Actor } from '@/app/api/_auth/access'
import { projectAccessMap } from '@/app/api/_auth/project-access'
import { recordActivity } from '@/app/api/_services/work/activity.service'
import { GOAL_COLUMNS, type GoalRow } from '@/app/api/_services/work/columns'
import { toGoal } from '@/app/api/_services/work/mappers'
import { issueCountsByProject } from '@/app/api/_services/work/projects.service'
import { assertMemberInWorkspace, dbOf, parseWorkInput, type WorkScope } from '@/app/api/_services/work/refs'
import { AppError } from '@/lib/i18n/action-error'
import { buildGoalTree, nestsUnderItself, progressOf, type GoalProgress, type GoalProjectRef, type GoalTreeNode } from '@/lib/work/goal-tree'
import { deleteRows, insertRow, selectAll, selectMaybeSingle, updateRows, type TablesUpdate } from '@/lib/db'

type GoalUpdate = TablesUpdate<'goals'>

async function readGoal(scope: WorkScope, goalId: string): Promise<GoalRow> {
    const { data } = await selectMaybeSingle(dbOf(scope), 'goals', GOAL_COLUMNS, { id: goalId, workspace_id: scope.workspaceId })
    if (!data) throw new AppError('goalNotFound')
    return data
}

async function readGoalLines(scope: WorkScope): Promise<{ id: string; parentGoalId: string | null }[]> {
    const { data, error } = await selectAll(dbOf(scope), 'goals', ['id', 'parent_goal_id'] as const, { workspace_id: scope.workspaceId })
    if (error) throw new Error(`Failed to read the goals: ${error.message}`)
    return (data ?? []).map(row => ({ id: row.id, parentGoalId: row.parent_goal_id }))
}

// What a goal links to (parent, team, owner) must belong to its workspace, and a parent never sits
// under the goal itself.
async function assertLinks(scope: WorkScope, goalId: string | null, links: { parentGoalId?: string | null; teamId?: string | null; ownerUserId?: string | null }): Promise<void> {
    const db = dbOf(scope)
    if (links.parentGoalId) {
        await readGoal(scope, links.parentGoalId)
        if (goalId && nestsUnderItself(await readGoalLines(scope), goalId, links.parentGoalId)) throw new AppError('goalParentInvalid')
    }
    if (links.teamId) {
        const { data } = await selectMaybeSingle(db, 'teams', ['id'] as const, { id: links.teamId, workspace_id: scope.workspaceId })
        if (!data) throw new AppError('teamNotFound')
    }
    if (links.ownerUserId) await assertMemberInWorkspace(scope, { kind: 'user', userId: links.ownerUserId })
}

export async function createGoal(scope: WorkScope, author: WorkAuthor, input: CreateGoalInput): Promise<Goal> {
    const fields = parseWorkInput(createGoalInputSchema, input)
    await assertLinks(scope, null, fields)
    const { data, error } = await insertRow(
        dbOf(scope),
        'goals',
        {
            workspace_id: scope.workspaceId,
            title: fields.title,
            description: fields.description ?? null,
            status: fields.status ?? 'planned',
            parent_goal_id: fields.parentGoalId ?? null,
            team_id: fields.teamId ?? null,
            owner_user_id: fields.ownerUserId ?? null,
            target_date: fields.targetDate ?? null,
        },
        GOAL_COLUMNS,
    )
    if (error || !data) throw new Error(`Failed to create the goal: ${error?.message}`)
    await recordActivity(scope, { action: 'goal.created', entityType: 'goal', entityId: data.id, author, metadata: { title: data.title } })
    return toGoal(data)
}

export async function updateGoal(scope: WorkScope, author: WorkAuthor, goalId: string, input: UpdateGoalInput): Promise<Goal> {
    const fields = parseWorkInput(updateGoalInputSchema, input)
    const current = await readGoal(scope, goalId)
    if (fields.parentGoalId === goalId) throw new AppError('goalParentInvalid')
    await assertLinks(scope, goalId, fields)

    const patch: GoalUpdate = {
        ...(fields.title !== undefined ? { title: fields.title } : {}),
        ...(fields.description !== undefined ? { description: fields.description } : {}),
        ...(fields.status !== undefined ? { status: fields.status } : {}),
        ...(fields.parentGoalId !== undefined ? { parent_goal_id: fields.parentGoalId } : {}),
        ...(fields.teamId !== undefined ? { team_id: fields.teamId } : {}),
        ...(fields.ownerUserId !== undefined ? { owner_user_id: fields.ownerUserId } : {}),
        ...(fields.targetDate !== undefined ? { target_date: fields.targetDate } : {}),
    }
    if (Object.keys(patch).length === 0) return toGoal(current)

    const { data: rows, error } = await updateRows(dbOf(scope), 'goals', patch, { id: goalId, workspace_id: scope.workspaceId }, GOAL_COLUMNS)
    const data = rows?.[0]
    if (error || !data) throw new Error(`Failed to update the goal: ${error?.message}`)

    const statusChanged = fields.status !== undefined && fields.status !== current.status
    const otherFields = Object.keys(patch).filter(field => field !== 'status')
    if (statusChanged) await recordActivity(scope, { action: 'goal.status_changed', entityType: 'goal', entityId: goalId, author, metadata: { from: current.status, to: data.status } })
    if (otherFields.length > 0) await recordActivity(scope, { action: 'goal.updated', entityType: 'goal', entityId: goalId, author, metadata: { fields: otherFields } })
    return toGoal(data)
}

// The goals under it move up to its parent rather than becoming roots; projects and issues linked to
// it lose the link (the foreign keys set it to null).
export async function deleteGoal(scope: WorkScope, author: WorkAuthor, goalId: string): Promise<void> {
    const goal = await readGoal(scope, goalId)
    const db = dbOf(scope)
    const { error: reparentError } = await updateRows(db, 'goals', { parent_goal_id: goal.parent_goal_id }, { parent_goal_id: goalId, workspace_id: scope.workspaceId })
    if (reparentError) throw new Error(`Failed to move the goals under this one: ${reparentError.message}`)
    const { error } = await deleteRows(db, 'goals', { id: goalId, workspace_id: scope.workspaceId })
    if (error) throw new Error(`Failed to delete the goal: ${error.message}`)
    await recordActivity(scope, { action: 'goal.deleted', entityType: 'goal', entityId: goalId, author, metadata: { title: goal.title } })
}

function countsToProgress(rows: readonly { status: IssueStatus }[]): GoalProgress {
    const counts: IssueCounts = {}
    for (const row of rows) counts[row.status] = (counts[row.status] ?? 0) + 1
    return progressOf(counts)
}

// Every goal as a tree, with the projects linked to it the actor can see and the progress of their
// issues. An issue linked to a goal directly counts once, even when its project is linked too.
export async function listGoalTree(scope: WorkScope, actor: Actor): Promise<GoalTreeNode[]> {
    const db = dbOf(scope)
    const [goals, projects, directIssues, access, counts] = await Promise.all([
        selectAll(db, 'goals', GOAL_COLUMNS, { workspace_id: scope.workspaceId }, { column: 'created_at', ascending: true }),
        selectAll(db, 'projects', ['id', 'key', 'name', 'status', 'goal_id'] as const, { workspace_id: scope.workspaceId, goal_id: { notNull: true }, archived_at: { isNull: true } }, { column: 'name', ascending: true }),
        selectAll(db, 'issues', ['id', 'goal_id', 'project_id', 'status'] as const, { workspace_id: scope.workspaceId, goal_id: { notNull: true } }),
        projectAccessMap(actor),
        issueCountsByProject(scope),
    ])
    if (goals.error) throw new Error(`Failed to list the goals: ${goals.error.message}`)
    if (projects.error) throw new Error(`Failed to list the goal projects: ${projects.error.message}`)
    if (directIssues.error) throw new Error(`Failed to count the goal issues: ${directIssues.error.message}`)

    const visible = (projectId: string) => (access.get(projectId) ?? 'none') !== 'none'
    const projectsByGoal = new Map<string, GoalProjectRef[]>()
    for (const project of projects.data ?? []) {
        if (!project.goal_id || !visible(project.id)) continue
        const ref: GoalProjectRef = { id: project.id, key: project.key, name: project.name, status: project.status, progress: progressOf(counts.get(project.id) ?? {}) }
        projectsByGoal.set(project.goal_id, [...(projectsByGoal.get(project.goal_id) ?? []), ref])
    }

    const directByGoal = new Map<string, { status: IssueStatus }[]>()
    for (const issue of directIssues.data ?? []) {
        if (!issue.goal_id || !visible(issue.project_id)) continue
        const alreadyCounted = (projectsByGoal.get(issue.goal_id) ?? []).some(project => project.id === issue.project_id)
        if (alreadyCounted) continue
        directByGoal.set(issue.goal_id, [...(directByGoal.get(issue.goal_id) ?? []), issue])
    }
    const directProgressByGoal = new Map([...directByGoal].map(([goalId, issues]) => [goalId, countsToProgress(issues)]))

    return buildGoalTree((goals.data ?? []).map(toGoal), { projectsByGoal, directProgressByGoal })
}

export async function assertGoalInWorkspace(scope: WorkScope, goalId: string): Promise<Goal> {
    return toGoal(await readGoal(scope, goalId))
}
