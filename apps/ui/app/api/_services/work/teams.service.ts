import 'server-only'

import {
    createTeamInputSchema,
    teamMemberInputSchema,
    teamMemberRoleSchema,
    updateTeamInputSchema,
    type CreateTeamInput,
    type ProjectStatus,
    type Team,
    type TeamMemberInput,
    type TeamMemberRole,
    type UpdateTeamInput,
    type WorkAuthor,
    type WorkMemberRef,
} from '@lumvika/contracts'

import { visibleAgentIds, type Actor } from '@/app/api/_auth/access'
import { projectAccessMap } from '@/app/api/_auth/project-access'
import type { Database } from '@/app/api/database.types'
import { recordActivity } from '@/app/api/_services/work/activity.service'
import { TEAM_COLUMNS, TEAM_MEMBER_COLUMNS, type TeamMemberRow, type TeamRow } from '@/app/api/_services/work/columns'
import { toTeam } from '@/app/api/_services/work/mappers'
import { assertMemberInWorkspace, authorColumns, clientOf, memberRefOf, parseWorkInput, type WorkScope } from '@/app/api/_services/work/refs'
import { AppError } from '@/lib/i18n/action-error'
import { selectAll, selectMaybeSingle } from '@/supabase/supabase-helpers'

type TeamUpdate = Database['public']['Tables']['teams']['Update']
type TeamMemberUpdate = Database['public']['Tables']['team_members']['Update']

const UNIQUE_VIOLATION = '23505'

export type TeamProjectRef = { id: string; key: string; name: string; status: ProjectStatus }
export type TeamOverview = Team & { projects: TeamProjectRef[] }

async function readTeam(scope: WorkScope, teamId: string): Promise<TeamRow> {
    const { data } = await selectMaybeSingle(clientOf(scope), 'teams', TEAM_COLUMNS, { id: teamId, workspace_id: scope.workspaceId })
    if (!data) throw new AppError('teamNotFound')
    return data
}

async function readMembers(scope: WorkScope, teamId: string): Promise<TeamMemberRow[]> {
    const { data, error } = await selectAll(clientOf(scope), 'team_members', TEAM_MEMBER_COLUMNS, { team_id: teamId, workspace_id: scope.workspaceId }, { column: 'created_at', ascending: true })
    if (error) throw new Error(`Failed to read the team members: ${error.message}`)
    return data ?? []
}

// A reader sees the coworkers of the Boxes they reach and no other: a team keeps its people and the
// coworkers the reader can see, and counts only those.
export function visibleTeam<T extends Team>(team: T, visible: 'all' | ReadonlySet<string>): T {
    if (visible === 'all') return team
    return { ...team, members: team.members.filter(entry => entry.member.kind === 'user' || visible.has(entry.member.agentId)) }
}

export async function getTeam(scope: WorkScope, teamId: string): Promise<Team> {
    const [row, members] = await Promise.all([readTeam(scope, teamId), readMembers(scope, teamId)])
    return toTeam(row, members)
}

export async function listTeams(scope: WorkScope, visible: 'all' | ReadonlySet<string>): Promise<Team[]> {
    const supabase = clientOf(scope)
    const [teams, members] = await Promise.all([
        selectAll(supabase, 'teams', TEAM_COLUMNS, { workspace_id: scope.workspaceId }, { column: 'name', ascending: true }),
        selectAll(supabase, 'team_members', TEAM_MEMBER_COLUMNS, { workspace_id: scope.workspaceId }, { column: 'created_at', ascending: true }),
    ])
    if (teams.error) throw new Error(`Failed to list the teams: ${teams.error.message}`)
    if (members.error) throw new Error(`Failed to list the team members: ${members.error.message}`)
    const byTeam = new Map<string, TeamMemberRow[]>()
    for (const member of members.data ?? []) byTeam.set(member.team_id, [...(byTeam.get(member.team_id) ?? []), member])
    return (teams.data ?? []).map(row => visibleTeam(toTeam(row, byTeam.get(row.id) ?? []), visible))
}

// Every team with the coworkers and the projects the actor can see.
export async function listTeamOverviews(scope: WorkScope, actor: Actor): Promise<TeamOverview[]> {
    const [teams, projects, access] = await Promise.all([
        visibleAgentIds(actor).then(visible => listTeams(scope, visible)),
        selectAll(clientOf(scope), 'projects', ['id', 'key', 'name', 'status', 'team_id', 'visibility', 'workspace_id'] as const, { workspace_id: scope.workspaceId, team_id: { notNull: true }, archived_at: { isNull: true } }, { column: 'name', ascending: true }),
        projectAccessMap(actor),
    ])
    if (projects.error) throw new Error(`Failed to list the team projects: ${projects.error.message}`)
    const byTeam = new Map<string, TeamProjectRef[]>()
    for (const project of projects.data ?? []) {
        if (!project.team_id || (access.get(project.id) ?? 'none') === 'none') continue
        byTeam.set(project.team_id, [...(byTeam.get(project.team_id) ?? []), { id: project.id, key: project.key, name: project.name, status: project.status }])
    }
    return teams.map(team => ({ ...team, projects: byTeam.get(team.id) ?? [] }))
}

// A person who leads the team manages its members without being an admin of the workspace.
export async function isTeamLead(scope: WorkScope, teamId: string, userId: string): Promise<boolean> {
    const { data } = await selectMaybeSingle(clientOf(scope), 'team_members', ['id'] as const, { team_id: teamId, workspace_id: scope.workspaceId, user_id: userId, role: 'lead' })
    return !!data
}

export async function createTeam(scope: WorkScope, author: WorkAuthor, input: CreateTeamInput): Promise<Team> {
    const fields = parseWorkInput(createTeamInputSchema, input)
    const { data, error } = await clientOf(scope)
        .from('teams')
        .insert<Database['public']['Tables']['teams']['Insert']>({ workspace_id: scope.workspaceId, name: fields.name, description: fields.description ?? null, color: fields.color ?? null })
        .select(TEAM_COLUMNS.join(','))
        .single<TeamRow>()
    if (error?.code === UNIQUE_VIOLATION) throw new AppError('teamNameTaken', { name: fields.name })
    if (error || !data) throw new Error(`Failed to create the team: ${error?.message}`)
    await recordActivity(scope, { action: 'team.created', entityType: 'team', entityId: data.id, author, metadata: { name: data.name } })
    return toTeam(data, [])
}

export async function updateTeam(scope: WorkScope, author: WorkAuthor, teamId: string, input: UpdateTeamInput): Promise<Team> {
    const fields = parseWorkInput(updateTeamInputSchema, input)
    await readTeam(scope, teamId)
    const patch: TeamUpdate = {
        ...(fields.name !== undefined ? { name: fields.name } : {}),
        ...(fields.description !== undefined ? { description: fields.description } : {}),
        ...(fields.color !== undefined ? { color: fields.color } : {}),
    }
    const changed = Object.keys(patch)
    if (changed.length === 0) return getTeam(scope, teamId)

    const { error } = await clientOf(scope).from('teams').update<TeamUpdate>(patch).eq('id', teamId).eq('workspace_id', scope.workspaceId)
    if (error?.code === UNIQUE_VIOLATION) throw new AppError('teamNameTaken', { name: fields.name ?? '' })
    if (error) throw new Error(`Failed to update the team: ${error.message}`)
    await recordActivity(scope, { action: 'team.updated', entityType: 'team', entityId: teamId, author, metadata: { fields: changed } })
    return getTeam(scope, teamId)
}

export async function deleteTeam(scope: WorkScope, author: WorkAuthor, teamId: string): Promise<void> {
    const team = await readTeam(scope, teamId)
    const { error } = await clientOf(scope).from('teams').delete().eq('id', teamId).eq('workspace_id', scope.workspaceId)
    if (error) throw new Error(`Failed to delete the team: ${error.message}`)
    await recordActivity(scope, { action: 'team.deleted', entityType: 'team', entityId: teamId, author, metadata: { name: team.name } })
}

function memberMetadata(row: Pick<TeamMemberRow, 'user_id' | 'agent_id'>): { userId: string | null; agentId: string | null } {
    return { userId: row.user_id, agentId: row.agent_id }
}

// A team has one lead: naming one hands the others back to plain members.
async function demoteOtherLeads(scope: WorkScope, teamId: string, keepMemberId: string): Promise<void> {
    const { error } = await clientOf(scope).from('team_members').update<TeamMemberUpdate>({ role: 'member' }).eq('team_id', teamId).eq('workspace_id', scope.workspaceId).eq('role', 'lead').neq('id', keepMemberId)
    if (error) throw new Error(`Failed to change the team lead: ${error.message}`)
}

export async function addTeamMember(scope: WorkScope, author: WorkAuthor, teamId: string, input: TeamMemberInput): Promise<Team> {
    const fields = parseWorkInput(teamMemberInputSchema, input)
    await readTeam(scope, teamId)
    await assertMemberInWorkspace(scope, fields.member)
    const columns = authorColumns(fields.member)
    const role = fields.role ?? 'member'

    const { data, error } = await clientOf(scope)
        .from('team_members')
        .insert<Database['public']['Tables']['team_members']['Insert']>({ team_id: teamId, workspace_id: scope.workspaceId, user_id: columns.userId, agent_id: columns.agentId, role })
        .select(TEAM_MEMBER_COLUMNS.join(','))
        .single<TeamMemberRow>()
    if (error?.code === UNIQUE_VIOLATION) throw new AppError('teamMemberAlreadyIn')
    if (error || !data) throw new Error(`Failed to add the team member: ${error?.message}`)
    if (role === 'lead') await demoteOtherLeads(scope, teamId, data.id)
    await recordActivity(scope, { action: 'team.member_added', entityType: 'team', entityId: teamId, author, metadata: { ...memberMetadata(data), role } })
    return getTeam(scope, teamId)
}

async function readMember(scope: WorkScope, teamId: string, memberId: string): Promise<TeamMemberRow> {
    const { data } = await selectMaybeSingle(clientOf(scope), 'team_members', TEAM_MEMBER_COLUMNS, { id: memberId, team_id: teamId, workspace_id: scope.workspaceId })
    if (!data) throw new AppError('teamMemberNotFound')
    return data
}

export async function readTeamMemberRef(scope: WorkScope, teamId: string, memberId: string): Promise<WorkMemberRef> {
    const member = await readMember(scope, teamId, memberId)
    const ref = memberRefOf(member.user_id, member.agent_id)
    if (!ref) throw new AppError('teamMemberNotFound')
    return ref
}

export async function removeTeamMember(scope: WorkScope, author: WorkAuthor, teamId: string, memberId: string): Promise<Team> {
    const member = await readMember(scope, teamId, memberId)
    const { error } = await clientOf(scope).from('team_members').delete().eq('id', memberId).eq('team_id', teamId).eq('workspace_id', scope.workspaceId)
    if (error) throw new Error(`Failed to remove the team member: ${error.message}`)
    await recordActivity(scope, { action: 'team.member_removed', entityType: 'team', entityId: teamId, author, metadata: memberMetadata(member) })
    return getTeam(scope, teamId)
}

export async function setTeamMemberRole(scope: WorkScope, author: WorkAuthor, teamId: string, memberId: string, role: TeamMemberRole): Promise<Team> {
    const parsedRole = parseWorkInput(teamMemberRoleSchema, role)
    const member = await readMember(scope, teamId, memberId)
    if (member.role === parsedRole) return getTeam(scope, teamId)

    const { error } = await clientOf(scope).from('team_members').update<TeamMemberUpdate>({ role: parsedRole }).eq('id', memberId).eq('team_id', teamId).eq('workspace_id', scope.workspaceId)
    if (error) throw new Error(`Failed to change the team member's role: ${error.message}`)
    if (parsedRole === 'lead') await demoteOtherLeads(scope, teamId, memberId)
    await recordActivity(scope, { action: 'team.member_role_changed', entityType: 'team', entityId: teamId, author, metadata: { ...memberMetadata(member), from: member.role, to: parsedRole } })
    return getTeam(scope, teamId)
}

// The names of the teams each coworker is on, for the roster a coworker reads of its colleagues.
export async function teamNamesByAgent(scope: WorkScope): Promise<Map<string, string[]>> {
    const supabase = clientOf(scope)
    const [teams, members] = await Promise.all([
        selectAll(supabase, 'teams', ['id', 'name'] as const, { workspace_id: scope.workspaceId }, { column: 'name', ascending: true }),
        selectAll(supabase, 'team_members', ['team_id', 'agent_id'] as const, { workspace_id: scope.workspaceId, agent_id: { notNull: true } }),
    ])
    const nameOf = new Map((teams.data ?? []).map(team => [team.id, team.name]))
    const byAgent = new Map<string, string[]>()
    for (const member of members.data ?? []) {
        const name = nameOf.get(member.team_id)
        if (!member.agent_id || !name) continue
        byAgent.set(member.agent_id, [...(byAgent.get(member.agent_id) ?? []), name].sort((a, b) => a.localeCompare(b)))
    }
    return byAgent
}
