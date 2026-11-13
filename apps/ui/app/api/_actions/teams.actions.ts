'use server'

import type { CreateTeamInput, Team, TeamMemberInput, TeamMemberRole, UpdateTeamInput, WorkMemberRef } from '@lumvika/contracts'

import { AccessDeniedError, actorFromContext, assertAgentAccess, visibleAgentIds } from '@/app/api/_auth/access'
import { requireAdminContext, requireWorkspaceContext, type WorkspaceContext } from '@/app/api/_auth/ownership'
import { userAuthorOf as authorOf, workScopeOf as scopeOf } from '@/app/api/_services/work/context-scope'
import { addTeamMember, createTeam, deleteTeam, isTeamLead, listTeamOverviews, readTeamMemberRef, removeTeamMember, setTeamMemberRole, updateTeam, visibleTeam, type TeamOverview } from '@/app/api/_services/work/teams.service'
import { AppError, failureOf } from '@/lib/i18n/action-error'

import type { ActionResult } from './space.actions'

// Who is on a team is changed by an admin, or by the person leading that team.
async function requireTeamMembersManager(teamId: string): Promise<WorkspaceContext> {
    const ctx = await requireWorkspaceContext()
    if (ctx.role === 'admin') return ctx
    if (await isTeamLead(scopeOf(ctx), teamId, ctx.userId)) return ctx
    throw new AccessDeniedError('teamManagerOnly')
}

// The team as the caller may see it: the coworkers of Boxes they do not reach are left out.
async function seenBy(ctx: WorkspaceContext, team: Team): Promise<Team> {
    return visibleTeam(team, await visibleAgentIds(actorFromContext(ctx)))
}

// A coworker the caller cannot see is refused as if it did not exist.
async function assertMemberSeen(ctx: WorkspaceContext, member: WorkMemberRef, notFound: () => Error): Promise<void> {
    if (member.kind !== 'agent') return
    const visible = await visibleAgentIds(actorFromContext(ctx))
    if (visible !== 'all' && !visible.has(member.agentId)) throw notFound()
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
        return { ok: true, team: await seenBy(ctx, await updateTeam(scopeOf(ctx), authorOf(ctx), teamId, input)) }
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
        if (input.member?.kind === 'agent') await assertAgentAccess(input.member.agentId, 'use', actorFromContext(ctx))
        return { ok: true, team: await seenBy(ctx, await addTeamMember(scopeOf(ctx), authorOf(ctx), teamId, input)) }
    } catch (err) {
        return failureOf(err)
    }
}

export async function removeTeamMemberAction(teamId: string, memberId: string): Promise<ActionResult<{ team: Team }>> {
    try {
        const ctx = await requireTeamMembersManager(teamId)
        await assertMemberSeen(ctx, await readTeamMemberRef(scopeOf(ctx), teamId, memberId), () => new AppError('teamMemberNotFound'))
        return { ok: true, team: await seenBy(ctx, await removeTeamMember(scopeOf(ctx), authorOf(ctx), teamId, memberId)) }
    } catch (err) {
        return failureOf(err)
    }
}

export async function setTeamMemberRoleAction(teamId: string, memberId: string, role: TeamMemberRole): Promise<ActionResult<{ team: Team }>> {
    try {
        const ctx = await requireTeamMembersManager(teamId)
        await assertMemberSeen(ctx, await readTeamMemberRef(scopeOf(ctx), teamId, memberId), () => new AppError('teamMemberNotFound'))
        return { ok: true, team: await seenBy(ctx, await setTeamMemberRole(scopeOf(ctx), authorOf(ctx), teamId, memberId, role)) }
    } catch (err) {
        return failureOf(err)
    }
}
