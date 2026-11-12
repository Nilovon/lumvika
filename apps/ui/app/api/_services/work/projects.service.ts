import 'server-only'

import {
    createProjectInputSchema,
    grantProjectMemberInputSchema,
    updateProjectInputSchema,
    type CreateProjectInput,
    type GrantProjectMemberInput,
    type IssueCounts,
    type IssueStatus,
    type ProjectDetail,
    type ProjectSummary,
    type UpdateProjectInput,
    type WorkAuthor,
    type WorkMemberRef,
} from '@lumvika/contracts'

import type { Actor } from '@/app/api/_auth/access'
import { PROJECT_NOT_FOUND, projectAccessFor, projectAccessMap } from '@/app/api/_auth/project-access'
import type { Database } from '@/app/api/database.types'
import { recordActivity } from '@/app/api/_services/work/activity.service'
import { PROJECT_COLUMNS, PROJECT_MEMBER_COLUMNS, type ProjectMemberRow, type ProjectRow } from '@/app/api/_services/work/columns'
import { toProjectDetail, toProjectSummary } from '@/app/api/_services/work/mappers'
import { assertMemberInWorkspace, authorColumns, clientOf, parseWorkInput, type WorkScope } from '@/app/api/_services/work/refs'
import { AppError } from '@/lib/i18n/action-error'
import { selectAll, selectMaybeSingle } from '@/supabase/supabase-helpers'

type ProjectUpdate = Database['public']['Tables']['projects']['Update']

const UNIQUE_VIOLATION = '23505'

async function readProject(scope: WorkScope, projectId: string): Promise<ProjectRow> {
    const { data } = await selectMaybeSingle(clientOf(scope), 'projects', PROJECT_COLUMNS, { id: projectId, workspace_id: scope.workspaceId })
    if (!data) throw new AppError(PROJECT_NOT_FOUND)
    return data
}

async function assertKeyFree(scope: WorkScope, key: string): Promise<void> {
    const { data } = await selectMaybeSingle(clientOf(scope), 'projects', ['id'] as const, { workspace_id: scope.workspaceId, key })
    if (data) throw new AppError('projectKeyTaken', { key })
}

// What a project links to (team, goal, lead) must belong to its workspace.
async function assertLinks(scope: WorkScope, links: { teamId?: string | null; goalId?: string | null; lead?: WorkMemberRef | null }): Promise<void> {
    const supabase = clientOf(scope)
    if (links.teamId) {
        const { data } = await selectMaybeSingle(supabase, 'teams', ['id'] as const, { id: links.teamId, workspace_id: scope.workspaceId })
        if (!data) throw new AppError('teamNotFound')
    }
    if (links.goalId) {
        const { data } = await selectMaybeSingle(supabase, 'goals', ['id'] as const, { id: links.goalId, workspace_id: scope.workspaceId })
        if (!data) throw new AppError('goalNotFound')
    }
    if (links.lead) await assertMemberInWorkspace(scope, links.lead)
}

function leadColumns(lead: WorkMemberRef | null | undefined): Pick<ProjectUpdate, 'lead_user_id' | 'lead_agent_id'> {
    if (lead === undefined) return {}
    const columns = authorColumns(lead)
    return { lead_user_id: columns.userId, lead_agent_id: columns.agentId }
}

// A person who creates a project manages it, whatever its visibility: a member does not manage a
// project open to the workspace on their role alone, and a member who reaches only the Boxes named
// to them would not even see it without the row.
async function grantCreatorManage(scope: WorkScope, projectId: string, author: WorkAuthor): Promise<void> {
    if (author.kind !== 'user') return
    const { error } = await clientOf(scope)
        .from('project_members')
        .upsert<Database['public']['Tables']['project_members']['Insert']>({ project_id: projectId, user_id: author.userId, workspace_id: scope.workspaceId, access: 'manage', granted_by: author.userId }, { onConflict: 'project_id,user_id' })
    if (error) throw new Error(`Failed to give you access to the project: ${error.message}`)
}

export async function createProject(scope: WorkScope, author: WorkAuthor, input: CreateProjectInput): Promise<ProjectRow> {
    const fields = parseWorkInput(createProjectInputSchema, input)
    await assertKeyFree(scope, fields.key)
    await assertLinks(scope, fields)

    const visibility = fields.visibility ?? 'workspace'
    const { data, error } = await clientOf(scope)
        .from('projects')
        .insert<Database['public']['Tables']['projects']['Insert']>({
            workspace_id: scope.workspaceId,
            key: fields.key,
            name: fields.name,
            description: fields.description ?? null,
            instructions: fields.instructions ?? null,
            status: fields.status ?? 'active',
            visibility,
            team_id: fields.teamId ?? null,
            goal_id: fields.goalId ?? null,
            ...leadColumns(fields.lead ?? null),
            monthly_budget_micros: fields.monthlyBudgetMicros ?? null,
            target_date: fields.targetDate ?? null,
            created_by: author.kind === 'user' ? author.userId : null,
        })
        .select(PROJECT_COLUMNS.join(','))
        .single<ProjectRow>()
    if (error?.code === UNIQUE_VIOLATION) throw new AppError('projectKeyTaken', { key: fields.key })
    if (error || !data) throw new Error(`Failed to create the project: ${error?.message}`)

    await grantCreatorManage(scope, data.id, author)
    await recordActivity(scope, { action: 'project.created', entityType: 'project', entityId: data.id, projectId: data.id, author, metadata: { key: data.key, name: data.name } })
    return data
}

export async function updateProject(scope: WorkScope, author: WorkAuthor, projectId: string, input: UpdateProjectInput): Promise<ProjectRow> {
    const fields = parseWorkInput(updateProjectInputSchema, input)
    await readProject(scope, projectId)
    await assertLinks(scope, fields)

    const patch: ProjectUpdate = {
        ...(fields.name !== undefined ? { name: fields.name } : {}),
        ...(fields.description !== undefined ? { description: fields.description } : {}),
        ...(fields.instructions !== undefined ? { instructions: fields.instructions } : {}),
        ...(fields.status !== undefined ? { status: fields.status } : {}),
        ...(fields.visibility !== undefined ? { visibility: fields.visibility } : {}),
        ...(fields.teamId !== undefined ? { team_id: fields.teamId } : {}),
        ...(fields.goalId !== undefined ? { goal_id: fields.goalId } : {}),
        ...leadColumns(fields.lead),
        ...(fields.monthlyBudgetMicros !== undefined ? { monthly_budget_micros: fields.monthlyBudgetMicros } : {}),
        ...(fields.targetDate !== undefined ? { target_date: fields.targetDate } : {}),
    }
    const changed = Object.keys(patch)
    if (changed.length === 0) return readProject(scope, projectId)

    const { data, error } = await clientOf(scope).from('projects').update<ProjectUpdate>(patch).eq('id', projectId).eq('workspace_id', scope.workspaceId).select(PROJECT_COLUMNS.join(',')).single<ProjectRow>()
    if (error || !data) throw new Error(`Failed to update the project: ${error?.message}`)
    if (fields.visibility === 'restricted') await grantCreatorManage(scope, projectId, author)
    await recordActivity(scope, { action: 'project.updated', entityType: 'project', entityId: projectId, projectId, author, metadata: { fields: changed } })
    return data
}

async function setArchived(scope: WorkScope, author: WorkAuthor, projectId: string, archived: boolean): Promise<ProjectRow> {
    await readProject(scope, projectId)
    const patch: ProjectUpdate = archived ? { archived_at: new Date().toISOString(), status: 'archived' } : { archived_at: null, status: 'active' }
    const { data, error } = await clientOf(scope).from('projects').update<ProjectUpdate>(patch).eq('id', projectId).eq('workspace_id', scope.workspaceId).select(PROJECT_COLUMNS.join(',')).single<ProjectRow>()
    if (error || !data) throw new Error(`Failed to ${archived ? 'archive' : 'restore'} the project: ${error?.message}`)
    await recordActivity(scope, { action: archived ? 'project.archived' : 'project.restored', entityType: 'project', entityId: projectId, projectId, author })
    return data
}

export async function archiveProject(scope: WorkScope, author: WorkAuthor, projectId: string): Promise<ProjectRow> {
    return setArchived(scope, author, projectId, true)
}

export async function restoreProject(scope: WorkScope, author: WorkAuthor, projectId: string): Promise<ProjectRow> {
    return setArchived(scope, author, projectId, false)
}

export async function issueCountsByProject(scope: WorkScope): Promise<Map<string, IssueCounts>> {
    const { data, error } = await clientOf(scope).rpc('project_issue_counts', { p_workspace_id: scope.workspaceId })
    if (error) throw new Error(`Failed to count the issues: ${error.message}`)
    const counts = new Map<string, IssueCounts>()
    for (const row of data ?? []) {
        const byStatus = counts.get(row.project_id) ?? {}
        byStatus[row.status as IssueStatus] = row.issue_count
        counts.set(row.project_id, byStatus)
    }
    return counts
}

// Every project the actor sees, with its issue counts by status and the actor's level on it.
export async function listProjects(scope: WorkScope, actor: Actor, options: { includeArchived?: boolean } = {}): Promise<ProjectSummary[]> {
    const [{ data, error }, access, counts] = await Promise.all([
        selectAll(clientOf(scope), 'projects', PROJECT_COLUMNS, { workspace_id: scope.workspaceId, archived_at: options.includeArchived ? undefined : { isNull: true } }, { column: 'created_at', ascending: true }),
        projectAccessMap(actor),
        issueCountsByProject(scope),
    ])
    if (error) throw new Error(`Failed to list the projects: ${error.message}`)
    return (data ?? []).flatMap(row => {
        const level = access.get(row.id) ?? 'none'
        return level === 'none' ? [] : [toProjectSummary(row, counts.get(row.id) ?? {}, level)]
    })
}

// Null when there is no such project or the actor does not see it: both read the same way.
export async function getProjectByKey(scope: WorkScope, actor: Actor, key: string): Promise<ProjectDetail | null> {
    const supabase = clientOf(scope)
    const { data: row } = await selectMaybeSingle(supabase, 'projects', PROJECT_COLUMNS, { workspace_id: scope.workspaceId, key: key.trim().toUpperCase() })
    if (!row) return null
    const access = await projectAccessFor(actor, row)
    if (access === 'none') return null
    const [counts, { data: members }] = await Promise.all([issueCountsByProject(scope), selectAll(supabase, 'project_members', PROJECT_MEMBER_COLUMNS, { project_id: row.id }, { column: 'created_at', ascending: true })])
    return toProjectDetail(row, counts.get(row.id) ?? {}, access, members ?? [])
}

export async function listProjectMembers(scope: WorkScope, projectId: string): Promise<ProjectMemberRow[]> {
    const { data, error } = await selectAll(clientOf(scope), 'project_members', PROJECT_MEMBER_COLUMNS, { project_id: projectId, workspace_id: scope.workspaceId }, { column: 'created_at', ascending: true })
    if (error) throw new Error(`Failed to list the project members: ${error.message}`)
    return data ?? []
}

export async function grantProjectMember(scope: WorkScope, author: WorkAuthor, projectId: string, input: GrantProjectMemberInput): Promise<void> {
    const grant = parseWorkInput(grantProjectMemberInputSchema, input)
    await readProject(scope, projectId)
    await assertMemberInWorkspace(scope, { kind: 'user', userId: grant.userId })
    const { error } = await clientOf(scope)
        .from('project_members')
        .upsert<Database['public']['Tables']['project_members']['Insert']>({ project_id: projectId, user_id: grant.userId, workspace_id: scope.workspaceId, access: grant.access, granted_by: author.kind === 'user' ? author.userId : null }, { onConflict: 'project_id,user_id' })
    if (error) throw new Error(`Failed to grant access to the project: ${error.message}`)
    await recordActivity(scope, { action: 'project.member_granted', entityType: 'project', entityId: projectId, projectId, author, metadata: { userId: grant.userId, access: grant.access } })
}

export async function revokeProjectMember(scope: WorkScope, author: WorkAuthor, projectId: string, userId: string): Promise<void> {
    await readProject(scope, projectId)
    const { error } = await clientOf(scope).from('project_members').delete().eq('project_id', projectId).eq('user_id', userId).eq('workspace_id', scope.workspaceId)
    if (error) throw new Error(`Failed to remove access to the project: ${error.message}`)
    await recordActivity(scope, { action: 'project.member_revoked', entityType: 'project', entityId: projectId, projectId, author, metadata: { userId } })
}

