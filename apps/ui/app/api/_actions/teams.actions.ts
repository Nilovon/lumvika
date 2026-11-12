'use server'

import type { CreateTeamInput, Team, TeamMemberInput, TeamMemberRole, UpdateTeamInput } from '@lumvika/contracts'

import { AccessDeniedError, actorFromContext } from '@/app/api/_auth/access'
import { requireAdminContext, requireWorkspaceContext, type WorkspaceContext } from '@/app/api/_auth/ownership'
import { userAuthorOf as authorOf, workScopeOf as scopeOf } from '@/app/api/_services/work/context-scope'
import { addTeamMember, createTeam, deleteTeam, isTeamLead, listTeamOverviews, removeTeamMember, setTeamMemberRole, updateTeam, type TeamOverview } from '@/app/api/_services/work/teams.service'
import { failureOf } from '@/lib/i18n/action-error'

import type { ActionResult } from './space.actions'

// Who is on a team is changed by an admin, or by the person leading that team.
async function requireTeamMembersManager(teamId: string): Promise<WorkspaceContext> {
    const ctx = await requireWorkspaceContext()
    if (ctx.role === 'admin') return ctx
    if (await isTeamLead(scopeOf(ctx), teamId, ctx.userId)) return ctx
    throw new AccessDeniedError('teamManagerOnly')
}

export async function listTeamsAction(): Promise<ActionResult<{ teams: TeamOverview[] }>> {
    try {
        const ctx = await requireWorkspaceContext()
        return { ok: true, teams: await listTeamOverviews(scopeOf(ctx), actorFromContext(ctx)) }
    } catch (err) {
        return failureOf(err)
    }
}

export async function createTeamAction(input: CreateTeamInput): Promise<ActionResult<{ team: Team }>> {
    try {
        const ctx = await requireAdminContext()
        return { ok: true, team: await createTeam(scopeOf(ctx), authorOf(ctx), input) }
    } catch (err) {
        return failureOf(err)
    }
}

export async function updateTeamAction(teamId: string, input: UpdateTeamInput): Promise<ActionResult<{ team: Team }>> {
    try {
        const ctx = await requireAdminContext()
        return { ok: true, team: await updateTeam(scopeOf(ctx), authorOf(ctx), teamId, input) }
    } catch (err) {
        return failureOf(err)
    }
}

export async function deleteTeamAction(teamId: string): Promise<ActionResult> {
    try {
        const ctx = await requireAdminContext()
        await deleteTeam(scopeOf(ctx), authorOf(ctx), teamId)
        return { ok: true }
    } catch (err) {
        return failureOf(err)
    }
}

export async function addTeamMemberAction(teamId: string, input: TeamMemberInput): Promise<ActionResult<{ team: Team }>> {
    try {
        const ctx = await requireTeamMembersManager(teamId)
        return { ok: true, team: await addTeamMember(scopeOf(ctx), authorOf(ctx), teamId, input) }
    } catch (err) {
        return failureOf(err)
    }
}

export async function removeTeamMemberAction(teamId: string, memberId: string): Promise<ActionResult<{ team: Team }>> {
    try {
        const ctx = await requireTeamMembersManager(teamId)
        return { ok: true, team: await removeTeamMember(scopeOf(ctx), authorOf(ctx), teamId, memberId) }
    } catch (err) {
        return failureOf(err)
    }
}

export async function setTeamMemberRoleAction(teamId: string, memberId: string, role: TeamMemberRole): Promise<ActionResult<{ team: Team }>> {
    try {
        const ctx = await requireTeamMembersManager(teamId)
        return { ok: true, team: await setTeamMemberRole(scopeOf(ctx), authorOf(ctx), teamId, memberId, role) }
    } catch (err) {
        return failureOf(err)
    }
}
