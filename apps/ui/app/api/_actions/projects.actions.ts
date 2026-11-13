'use server'

import { PROJECT_KEY_PATTERN, SYSTEM_AUTHOR, type CreateProjectInput, type ProjectAccess, type ProjectDetail, type ProjectMember, type ProjectSummary, type UpdateProjectInput, type WorkAuthor } from '@lumvika/contracts'
import { z } from 'zod'

import { requireLightSessionActor, type Actor } from '@/app/api/_auth/access'
import { assertProjectAccess, PROJECT_NOT_FOUND } from '@/app/api/_auth/project-access'
import type { WorkspaceRole } from '@/app/api/_auth/ownership'
import { resolveMemberIdentities } from '@/app/api/_services/members.service'
import { toProjectMember } from '@/app/api/_services/work/mappers'
import { assertAssignableBy, parseWorkInput } from '@/app/api/_services/work/refs'
import { archiveProject, createProject, getProjectByKey, grantProjectMember, listProjectMembers, listProjects, restoreProject, revokeProjectMember, updateProject } from '@/app/api/_services/work/projects.service'
import { failure, failureOf } from '@/lib/i18n/action-error'
import { createServiceRoleClient } from '@/supabase/serviceRole'
import { selectAll, selectMaybeSingle } from '@/supabase/supabase-helpers'
import type { ActionResult } from './space.actions'

export type ProjectAccessPerson = { userId: string; email: string | null; role: WorkspaceRole }
export type ProjectAccessView = { projectId: string; people: ProjectMember[]; members: ProjectAccessPerson[] }

export type ProjectKeyCheck = 'available' | 'taken' | 'invalid'

// One grant names at most this many people, each once.
const grantedUserIdsSchema = z.array(z.string().min(1).max(64)).min(1).max(500)

function authorOf(actor: Actor): WorkAuthor {
    return actor.kind === 'user' ? { kind: 'user', userId: actor.userId } : SYSTEM_AUTHOR
}

function scopeOf(actor: Actor) {
    return { workspaceId: actor.workspaceId }
}

export async function listProjectsAction(options: { includeArchived?: boolean } = {}): Promise<ActionResult<{ projects: ProjectSummary[] }>> {
    try {
        const actor = await requireLightSessionActor()
        const projects = await listProjects(scopeOf(actor), actor, { includeArchived: options.includeArchived })
        return { ok: true, projects }
    } catch (err) {
        return failureOf(err)
    }
}

export async function getProjectAction(key: string): Promise<ActionResult<{ project: ProjectDetail }>> {
    try {
        const actor = await requireLightSessionActor()
        const project = await getProjectByKey(scopeOf(actor), actor, key)
        if (!project) return failure(PROJECT_NOT_FOUND)
        return { ok: true, project }
    } catch (err) {
        return failureOf(err)
    }
}

// A key is checked while it is typed: the create still refuses a key taken in the meantime.
export async function checkProjectKeyAction(key: string): Promise<ActionResult<{ check: ProjectKeyCheck }>> {
    try {
        const actor = await requireLightSessionActor()
        const normalized = key.trim().toUpperCase()
        if (!PROJECT_KEY_PATTERN.test(normalized)) return { ok: true, check: 'invalid' }
        const { data } = await selectMaybeSingle(createServiceRoleClient(), 'projects', ['id'] as const, { workspace_id: actor.workspaceId, key: normalized })
        return { ok: true, check: data ? 'taken' : 'available' }
    } catch (err) {
        return failureOf(err)
    }
}

// Any member of the workspace may start a project; restricting it names them its manager.
export async function createProjectAction(input: CreateProjectInput): Promise<ActionResult<{ projectId: string; key: string }>> {
    try {
        const actor = await requireLightSessionActor()
        await assertAssignableBy(actor, input.lead)
        const row = await createProject(scopeOf(actor), authorOf(actor), input)
        return { ok: true, projectId: row.id, key: row.key }
    } catch (err) {
        return failureOf(err)
    }
}

export async function updateProjectAction(projectId: string, input: UpdateProjectInput): Promise<ActionResult> {
    try {
        const { actor } = await assertProjectAccess(projectId, 'manage')
        await assertAssignableBy(actor, input.lead)
        await updateProject(scopeOf(actor), authorOf(actor), projectId, input)
        return { ok: true }
    } catch (err) {
        return failureOf(err)
    }
}

export async function archiveProjectAction(projectId: string): Promise<ActionResult> {
    try {
        const { actor } = await assertProjectAccess(projectId, 'manage')
        await archiveProject(scopeOf(actor), authorOf(actor), projectId)
        return { ok: true }
    } catch (err) {
        return failureOf(err)
    }
}

export async function restoreProjectAction(projectId: string): Promise<ActionResult> {
    try {
        const { actor } = await assertProjectAccess(projectId, 'manage')
        await restoreProject(scopeOf(actor), authorOf(actor), projectId)
        return { ok: true }
    } catch (err) {
        return failureOf(err)
    }
}

// The people named on the project, and every member of the workspace to pick from.
export async function getProjectAccessAction(projectId: string): Promise<ActionResult<ProjectAccessView>> {
    try {
        const { actor } = await assertProjectAccess(projectId, 'manage')
        const supabase = createServiceRoleClient()
        const [grants, { data: memberRows }] = await Promise.all([
            listProjectMembers(scopeOf(actor), projectId),
            selectAll(supabase, 'workspace_members', ['user_id', 'role'] as const, { workspace_id: actor.workspaceId }, { column: 'created_at', ascending: true }),
        ])
        const members = memberRows ?? []
        const identities = await resolveMemberIdentities(
            supabase,
            members.map(member => member.user_id),
        )
        return {
            ok: true,
            projectId,
            people: grants.map(toProjectMember),
            members: members.map(member => ({ userId: member.user_id, email: identities.get(member.user_id)?.email ?? null, role: member.role })),
        }
    } catch (err) {
        return failureOf(err)
    }
}

export async function grantProjectAccessAction(projectId: string, userIds: string[], access: ProjectAccess): Promise<ActionResult> {
    try {
        const { actor } = await assertProjectAccess(projectId, 'manage')
        const author = authorOf(actor)
        for (const userId of new Set(parseWorkInput(grantedUserIdsSchema, userIds))) await grantProjectMember(scopeOf(actor), author, projectId, { userId, access })
        return { ok: true }
    } catch (err) {
        return failureOf(err)
    }
}

export async function revokeProjectAccessAction(projectId: string, userId: string): Promise<ActionResult> {
    try {
        const { actor } = await assertProjectAccess(projectId, 'manage')
        await revokeProjectMember(scopeOf(actor), authorOf(actor), projectId, userId)
        return { ok: true }
    } catch (err) {
        return failureOf(err)
    }
}
