'use server'

import type { CreateGoalInput, Goal, ProjectAccess, UpdateGoalInput } from '@lumvika/contracts'

import { actorFromContext } from '@/app/api/_auth/access'
import { requireAdminContext, requireWorkspaceContext } from '@/app/api/_auth/ownership'
import { assertProjectAccess } from '@/app/api/_auth/project-access'
import { userAuthorOf, workScopeOf } from '@/app/api/_services/work/context-scope'
import { assertGoalInWorkspace, createGoal, deleteGoal, listGoalTree, updateGoal } from '@/app/api/_services/work/goals.service'
import { listProjects, updateProject } from '@/app/api/_services/work/projects.service'
import { listTeams } from '@/app/api/_services/work/teams.service'
import { failureOf } from '@/lib/i18n/action-error'
import type { GoalTreeNode } from '@/lib/work/goal-tree'

import type { ActionResult } from './space.actions'

export type GoalTeamOption = { id: string; name: string; color: string | null }
export type GoalProjectOption = { id: string; key: string; name: string; goalId: string | null; access: ProjectAccess }

export type GoalsOverview = { goals: GoalTreeNode[]; teams: GoalTeamOption[]; projects: GoalProjectOption[] }

export async function listGoalsAction(): Promise<ActionResult<GoalsOverview>> {
    try {
        const ctx = await requireWorkspaceContext()
        const scope = workScopeOf(ctx)
        const actor = actorFromContext(ctx)
        const [goals, teams, projects] = await Promise.all([listGoalTree(scope, actor), listTeams(scope), listProjects(scope, actor)])
        return {
            ok: true,
            goals,
            teams: teams.map(team => ({ id: team.id, name: team.name, color: team.color })),
            projects: projects.map(project => ({ id: project.id, key: project.key, name: project.name, goalId: project.goalId, access: project.access })),
        }
    } catch (err) {
        return failureOf(err)
    }
}

export async function createGoalAction(input: CreateGoalInput): Promise<ActionResult<{ goal: Goal }>> {
    try {
        const ctx = await requireAdminContext()
        return { ok: true, goal: await createGoal(workScopeOf(ctx), userAuthorOf(ctx), input) }
    } catch (err) {
        return failureOf(err)
    }
}

export async function updateGoalAction(goalId: string, input: UpdateGoalInput): Promise<ActionResult<{ goal: Goal }>> {
    try {
        const ctx = await requireAdminContext()
        return { ok: true, goal: await updateGoal(workScopeOf(ctx), userAuthorOf(ctx), goalId, input) }
    } catch (err) {
        return failureOf(err)
    }
}

export async function deleteGoalAction(goalId: string): Promise<ActionResult> {
    try {
        const ctx = await requireAdminContext()
        await deleteGoal(workScopeOf(ctx), userAuthorOf(ctx), goalId)
        return { ok: true }
    } catch (err) {
        return failureOf(err)
    }
}

// Linking is a change to the project, so it takes the right to manage the project, not the goal.
export async function setProjectGoalAction(projectId: string, goalId: string | null): Promise<ActionResult> {
    try {
        const ctx = await requireWorkspaceContext()
        const scope = workScopeOf(ctx)
        await assertProjectAccess(projectId, 'manage', actorFromContext(ctx))
        if (goalId) await assertGoalInWorkspace(scope, goalId)
        await updateProject(scope, userAuthorOf(ctx), projectId, { goalId })
        return { ok: true }
    } catch (err) {
        return failureOf(err)
    }
}
