import { beforeEach, describe, expect, it, vi } from 'vitest'

import { workDatabase, type Row, type Tables } from '@/test/work-fake'

const mocks = vi.hoisted(() => ({ getServerSession: vi.fn() }))

vi.mock('@/supabase/session/getServerSession', () => ({ getServerSession: mocks.getServerSession, getSessionWorkspace: mocks.getServerSession }))
vi.mock('@/supabase/serviceRole', () => ({ createServiceRoleClient: vi.fn() }))

const { createServiceRoleClient } = await import('@/supabase/serviceRole')
const { createGoalAction, deleteGoalAction, listGoalsAction, setProjectGoalAction, updateGoalAction } = await import('./goals.actions')

const WORKSPACE = 7
const ME = 'user-me'

function project(id: string, overrides: Row = {}): Row {
    return { id, workspace_id: WORKSPACE, key: id.toUpperCase(), name: id, description: null, instructions: null, status: 'active', visibility: 'workspace', team_id: null, goal_id: null, lead_user_id: null, lead_agent_id: null, monthly_budget_micros: null, target_date: null, created_by: null, archived_at: null, created_at: 'then', updated_at: 'then', ...overrides }
}

function signedInAs(role: 'admin' | 'member', tables: Partial<Tables> = {}) {
    mocks.getServerSession.mockResolvedValue({ user: { id: ME, workspace_id: WORKSPACE }, workspace: { id: WORKSPACE, name: 'Acme' }, session: { id: ME, email: 'me@acme.test' }, workspaceRefused: false })
    const rows: Tables = {
        workspace_members: [{ user_id: ME, workspace_id: WORKSPACE, role, box_scope: 'all' }],
        goals: [{ id: 'goal-1', workspace_id: WORKSPACE, parent_goal_id: null, team_id: null, title: 'Grow', description: null, status: 'active', owner_user_id: null, target_date: null, created_at: 'then', updated_at: 'then' }],
        teams: [{ id: 'team-1', workspace_id: WORKSPACE, name: 'Growth', description: null, color: '#2563eb', created_at: 'then', updated_at: 'then' }],
        team_members: [],
        projects: [project('web')],
        project_members: [],
        issues: [],
        activity_events: [],
        ...tables,
    }
    const db = workDatabase(rows, { rpc: { project_issue_counts: () => [] } })
    vi.mocked(createServiceRoleClient).mockReturnValue(db.client)
    return { db, rows }
}

beforeEach(() => vi.clearAllMocks())

describe('goals actions', () => {
    it('lets any member read the goals with the teams and projects to pick from', async () => {
        signedInAs('member')
        await expect(listGoalsAction()).resolves.toMatchObject({
            ok: true,
            goals: [{ id: 'goal-1', title: 'Grow', children: [], projects: [] }],
            teams: [{ id: 'team-1', name: 'Growth', color: '#2563eb' }],
            projects: [{ id: 'web', key: 'WEB', goalId: null, access: 'use' }],
        })
    })

    it('keeps creating, editing and deleting a goal to admins', async () => {
        const { rows } = signedInAs('member')
        await expect(createGoalAction({ title: 'Ship' })).resolves.toMatchObject({ ok: false, code: 'adminOnly' })
        await expect(updateGoalAction('goal-1', { status: 'achieved' })).resolves.toMatchObject({ ok: false, code: 'adminOnly' })
        await expect(deleteGoalAction('goal-1')).resolves.toMatchObject({ ok: false, code: 'adminOnly' })
        expect(rows.goals).toHaveLength(1)
    })

    it('creates and deletes a goal as an admin', async () => {
        const { rows } = signedInAs('admin')
        await expect(createGoalAction({ title: 'Ship', parentGoalId: 'goal-1' })).resolves.toMatchObject({ ok: true, goal: { title: 'Ship', parentGoalId: 'goal-1' } })
        await expect(deleteGoalAction('goal-1')).resolves.toEqual({ ok: true })
        expect(rows.goals.map(goal => [goal.title, goal.parent_goal_id])).toEqual([['Ship', null]])
    })

    it('links a project to a goal only for someone who manages the project', async () => {
        const member = signedInAs('member')
        await expect(setProjectGoalAction('web', 'goal-1')).resolves.toMatchObject({ ok: false, code: 'projectManagerOnly' })
        expect(member.rows.projects[0].goal_id).toBeNull()

        const manager = signedInAs('member', { project_members: [{ project_id: 'web', user_id: ME, workspace_id: WORKSPACE, access: 'manage' }] })
        await expect(setProjectGoalAction('web', 'goal-1')).resolves.toEqual({ ok: true })
        expect(manager.rows.projects[0].goal_id).toBe('goal-1')
        expect(manager.rows.activity_events[0]).toMatchObject({ action: 'project.updated', metadata: { fields: ['goal_id'] } })

        await expect(setProjectGoalAction('web', null)).resolves.toEqual({ ok: true })
        expect(manager.rows.projects[0].goal_id).toBeNull()
    })

    it('refuses a goal or a project the workspace does not have', async () => {
        signedInAs('admin', { projects: [project('web'), project('far', { workspace_id: 99 })] })
        await expect(setProjectGoalAction('web', 'goal-x')).resolves.toMatchObject({ ok: false, code: 'goalNotFound' })
        await expect(setProjectGoalAction('far', 'goal-1')).resolves.toMatchObject({ ok: false, code: 'projectNotFound' })
    })
})
