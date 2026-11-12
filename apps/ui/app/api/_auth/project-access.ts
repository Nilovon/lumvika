import { AuthorizationError } from '@/app/api/_auth/errors'
import { AccessDeniedError, hasAccess, isAdminActor, requireLightSessionActor, toAccessLevel, toVisibility, type AccessLevel, type Actor, type BoxAccess } from '@/app/api/_auth/access'
import type { ErrorCode } from '@/lib/i18n/action-error'
import { createServiceRoleClient } from '@/supabase/serviceRole'
import { selectAll, selectMany, selectMaybeSingle } from '@/supabase/supabase-helpers'

// Access by project and by channel, the server's copy of the rules the database holds in
// `visible_project_ids()` / `manageable_project_ids()` / `visible_channel_ids()` for RLS. Both copies
// must answer the same thing (see the header of access.ts for the Box rule they follow).
//
// Project:
//   admin (or the workspace itself)                -> manage
//   a `project_members` row                        -> its level (use | manage)
//   scope `all` and the project open to everyone   -> use
//   otherwise                                      -> none
//
// Channel:
//   the workspace itself                           -> manage
//   member of it, or public and (admin or scope `all`) -> use, manage for an admin or its creator
//   (a direct message is never managed)
//   otherwise                                      -> none
//
// Issues, comments and activity follow their project.

export type ProjectAccess = BoxAccess
export type ChannelAccess = BoxAccess

export const PROJECT_NOT_FOUND = 'projectNotFound' satisfies ErrorCode
export const PROJECT_MANAGE_ONLY = 'projectManagerOnly' satisfies ErrorCode
export const ISSUE_NOT_FOUND = 'issueNotFound' satisfies ErrorCode
export const CHANNEL_NOT_FOUND = 'channelNotFound' satisfies ErrorCode
export const CHANNEL_MANAGE_ONLY = 'channelManagerOnly' satisfies ErrorCode

type ProjectRule = { workspace_id: number; visibility: string | null }
type ChannelRule = { workspace_id: number; kind: string; created_by: string | null }

export type GuardedProject = { id: string; workspace_id: number; key: string; visibility: string; archived_at: string | null }
export type GuardedIssue = { id: string; workspace_id: number; project_id: string; number: number }
export type GuardedChannel = { id: string; workspace_id: number; kind: string; created_by: string | null; archived_at: string | null }

const GUARDED_PROJECT_COLUMNS = ['id', 'workspace_id', 'key', 'visibility', 'archived_at'] as const
const GUARDED_ISSUE_COLUMNS = ['id', 'workspace_id', 'project_id', 'number'] as const
const GUARDED_CHANNEL_COLUMNS = ['id', 'workspace_id', 'kind', 'created_by', 'archived_at'] as const

export function projectAccessOf(actor: Actor, project: ProjectRule, grant: AccessLevel | null): ProjectAccess {
    if (project.workspace_id !== actor.workspaceId) return 'none'
    if (isAdminActor(actor)) return 'manage'
    if (grant) return grant
    if (actor.kind === 'user' && actor.boxScope === 'all' && toVisibility(project.visibility) === 'workspace') return 'use'
    return 'none'
}

export function channelAccessOf(actor: Actor, channel: ChannelRule, isMember: boolean): ChannelAccess {
    if (channel.workspace_id !== actor.workspaceId) return 'none'
    if (actor.kind === 'workspace') return 'manage'
    const isAdmin = actor.role === 'admin'
    const reaches = isMember || (channel.kind === 'public' && (isAdmin || actor.boxScope === 'all'))
    if (!reaches) return 'none'
    if (channel.kind !== 'dm' && (isAdmin || channel.created_by === actor.userId)) return 'manage'
    return 'use'
}

function enforce(have: BoxAccess, need: AccessLevel, notFound: ErrorCode, denied: ErrorCode): void {
    if (have === 'none') throw new AuthorizationError(notFound)
    if (!hasAccess(have, need)) throw new AccessDeniedError(denied)
}

async function projectGrantOf(actor: Actor, projectId: string): Promise<AccessLevel | null> {
    if (actor.kind !== 'user' || actor.role === 'admin') return null
    const { data } = await selectMaybeSingle(createServiceRoleClient(), 'project_members', ['access'] as const, { project_id: projectId, user_id: actor.userId })
    return toAccessLevel(data?.access)
}

export async function projectAccessFor(actor: Actor, project: ProjectRule & { id: string }): Promise<ProjectAccess> {
    if (project.workspace_id !== actor.workspaceId) return 'none'
    return projectAccessOf(actor, project, await projectGrantOf(actor, project.id))
}

export async function assertProjectAccess(projectId: string, need: AccessLevel, actor?: Actor): Promise<{ actor: Actor; access: ProjectAccess; project: GuardedProject }> {
    const resolved = actor ?? (await requireLightSessionActor())
    const { data: project } = await selectMaybeSingle(createServiceRoleClient(), 'projects', GUARDED_PROJECT_COLUMNS, { id: projectId })
    if (!project || project.workspace_id !== resolved.workspaceId) throw new AuthorizationError(PROJECT_NOT_FOUND)
    const access = await projectAccessFor(resolved, project)
    enforce(access, need, PROJECT_NOT_FOUND, PROJECT_MANAGE_ONLY)
    return { actor: resolved, access, project }
}

// The same guard reached by the key people type (ENG), for a route named by a reference.
export async function assertProjectAccessByKey(key: string, need: AccessLevel, actor?: Actor): Promise<{ actor: Actor; access: ProjectAccess; project: GuardedProject }> {
    const resolved = actor ?? (await requireLightSessionActor())
    const { data: project } = await selectMaybeSingle(createServiceRoleClient(), 'projects', GUARDED_PROJECT_COLUMNS, { workspace_id: resolved.workspaceId, key: key.toUpperCase() })
    if (!project) throw new AuthorizationError(PROJECT_NOT_FOUND)
    const access = await projectAccessFor(resolved, project)
    enforce(access, need, PROJECT_NOT_FOUND, PROJECT_MANAGE_ONLY)
    return { actor: resolved, access, project }
}

// An issue the actor cannot see does not exist: its refusal names the issue, not the project.
export async function assertIssueAccess(issueId: string, need: AccessLevel, actor?: Actor): Promise<{ actor: Actor; access: ProjectAccess; issue: GuardedIssue; project: GuardedProject }> {
    const resolved = actor ?? (await requireLightSessionActor())
    const supabase = createServiceRoleClient()
    const { data: issue } = await selectMaybeSingle(supabase, 'issues', GUARDED_ISSUE_COLUMNS, { id: issueId })
    if (!issue || issue.workspace_id !== resolved.workspaceId) throw new AuthorizationError(ISSUE_NOT_FOUND)
    const { data: project } = await selectMaybeSingle(supabase, 'projects', GUARDED_PROJECT_COLUMNS, { id: issue.project_id })
    if (!project) throw new AuthorizationError(ISSUE_NOT_FOUND)
    const access = await projectAccessFor(resolved, project)
    enforce(access, need, ISSUE_NOT_FOUND, PROJECT_MANAGE_ONLY)
    return { actor: resolved, access, issue, project }
}

// Every project of the workspace with the actor's level on it, in two reads.
export async function projectAccessMap(actor: Actor): Promise<Map<string, ProjectAccess>> {
    const supabase = createServiceRoleClient()
    const grantsRead = actor.kind === 'user' && actor.role !== 'admin' ? selectMany(supabase, 'project_members', ['project_id', 'access'] as const, { user_id: actor.userId, workspace_id: actor.workspaceId }) : Promise.resolve({ data: [] })
    const [{ data: projects }, { data: grants }] = await Promise.all([selectAll(supabase, 'projects', ['id', 'workspace_id', 'visibility'] as const, { workspace_id: actor.workspaceId }), grantsRead])
    const grantByProject = new Map((grants ?? []).map(row => [row.project_id, toAccessLevel(row.access)]))
    return new Map((projects ?? []).map(project => [project.id, projectAccessOf(actor, project, grantByProject.get(project.id) ?? null)]))
}

// 'all' when nothing needs filtering (an admin, or the workspace), otherwise the ids.
export async function visibleProjectIds(actor: Actor): Promise<'all' | Set<string>> {
    if (isAdminActor(actor)) return 'all'
    const map = await projectAccessMap(actor)
    return new Set([...map].filter(([, access]) => access !== 'none').map(([id]) => id))
}

export async function manageableProjectIds(actor: Actor): Promise<'all' | Set<string>> {
    if (isAdminActor(actor)) return 'all'
    const map = await projectAccessMap(actor)
    return new Set([...map].filter(([, access]) => access === 'manage').map(([id]) => id))
}

async function isChannelMember(actor: Actor, channelId: string): Promise<boolean> {
    if (actor.kind !== 'user') return false
    const { data } = await selectMaybeSingle(createServiceRoleClient(), 'channel_members', ['id'] as const, { channel_id: channelId, user_id: actor.userId })
    return !!data
}

export async function assertChannelAccess(channelId: string, need: AccessLevel, actor?: Actor): Promise<{ actor: Actor; access: ChannelAccess; channel: GuardedChannel }> {
    const resolved = actor ?? (await requireLightSessionActor())
    const { data: channel } = await selectMaybeSingle(createServiceRoleClient(), 'channels', GUARDED_CHANNEL_COLUMNS, { id: channelId })
    if (!channel || channel.workspace_id !== resolved.workspaceId) throw new AuthorizationError(CHANNEL_NOT_FOUND)
    const access = channelAccessOf(resolved, channel, await isChannelMember(resolved, channel.id))
    enforce(access, need, CHANNEL_NOT_FOUND, CHANNEL_MANAGE_ONLY)
    return { actor: resolved, access, channel }
}

// The workspace itself reads every channel; a person reads the ones channelAccessOf lets through.
export async function visibleChannelIds(actor: Actor): Promise<'all' | Set<string>> {
    if (actor.kind === 'workspace') return 'all'
    const supabase = createServiceRoleClient()
    const [{ data: channels }, { data: memberships }] = await Promise.all([
        selectAll(supabase, 'channels', ['id', 'workspace_id', 'kind', 'created_by'] as const, { workspace_id: actor.workspaceId }),
        selectAll(supabase, 'channel_members', ['channel_id'] as const, { user_id: actor.userId, workspace_id: actor.workspaceId }),
    ])
    const joined = new Set((memberships ?? []).map(row => row.channel_id))
    return new Set((channels ?? []).filter(channel => channelAccessOf(actor, channel, joined.has(channel.id)) !== 'none').map(channel => channel.id))
}
