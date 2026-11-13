import { beforeEach, describe, expect, it, vi } from 'vitest'

import { workDatabase, type Row, type Tables } from '@/test/work-fake'

vi.mock('@/lib/db', async importOriginal => ({ ...(await importOriginal<object>()), ...(await import('@/test/work-fake')).workDbHelpers }))

const { createGoal, deleteGoal, listGoalTree, updateGoal } = await import('./goals.service')

type Actor = import('@/app/api/_auth/access').Actor

const WORKSPACE = 7
const ME = { kind: 'user', userId: 'me' } as const
const member: Actor = { kind: 'user', userId: 'me', workspaceId: WORKSPACE, role: 'member', boxScope: 'all' }

function goal(id: string, overrides: Row = {}): Row {
    return { id, workspace_id: WORKSPACE, parent_goal_id: null, team_id: null, title: id, description: null, status: 'active', owner_user_id: null, target_date: null, created_at: `2026-11-01T00:00:0${id.length}.000Z`, updated_at: 'then', ...overrides }
}

function project(id: string, overrides: Row = {}): Row {
    return { id, workspace_id: WORKSPACE, key: id.toUpperCase(), name: id, status: 'active', goal_id: null, visibility: 'workspace', archived_at: null, ...overrides }
}

function setup(tables: Partial<Tables> = {}) {
    const rows: Tables = { goals: [], teams: [{ id: 'team-1', workspace_id: WORKSPACE }], projects: [], project_members: [], issues: [], activity_events: [], workspace_members: [{ user_id: 'me', workspace_id: WORKSPACE }], ...tables }
    const db = workDatabase(rows, {
        rpc: {
            project_issue_counts: () => {
                const counts = new Map<string, Row>()
                for (const issue of rows.issues) {
                    const key = `${issue.project_id}:${issue.status}`
                    const row = counts.get(key) ?? { project_id: issue.project_id, status: issue.status, issue_count: 0 }
                    row.issue_count = (row.issue_count as number) + 1
                    counts.set(key, row)
                }
                return [...counts.values()]
            },
        },
    })
    return { db, rows, scope: { workspaceId: WORKSPACE, db: db.scope } }
}

beforeEach(() => vi.clearAllMocks())

describe('createGoal', () => {
    it('creates a planned goal under a parent and logs it', async () => {
        const { db, rows, scope } = setup({ goals: [goal('company')] })
        const created = await createGoal(scope, ME, { title: 'Grow', parentGoalId: 'company', teamId: 'team-1', ownerUserId: 'me', targetDate: '2026-12-31' })
        expect(db.writes('goals')[0].payload).toMatchObject({ title: 'Grow', status: 'planned', parent_goal_id: 'company', team_id: 'team-1', owner_user_id: 'me', target_date: '2026-12-31' })
        expect(created).toMatchObject({ title: 'Grow', parentGoalId: 'company' })
        expect(rows.activity_events[0]).toMatchObject({ action: 'goal.created', entity_type: 'goal', entity_id: created.id })
    })

    it('refuses links outside the workspace', async () => {
        const { scope } = setup({ goals: [goal('elsewhere', { workspace_id: 99 })] })
        await expect(createGoal(scope, ME, { title: 'x', parentGoalId: 'elsewhere' })).rejects.toMatchObject({ code: 'goalNotFound' })
        await expect(createGoal(scope, ME, { title: 'x', teamId: 'team-x' })).rejects.toMatchObject({ code: 'teamNotFound' })
        await expect(createGoal(scope, ME, { title: 'x', ownerUserId: 'stranger' })).rejects.toMatchObject({ code: 'assigneeNotInWorkspace' })
        await expect(createGoal(scope, ME, { title: ' ' })).rejects.toMatchObject({ code: 'titleRequired' })
    })
})

describe('updateGoal', () => {
    it('logs a status change apart from the other fields', async () => {
        const { rows, scope } = setup({ goals: [goal('grow', { status: 'active' })] })
        const updated = await updateGoal(scope, ME, 'grow', { status: 'achieved', title: 'Grown' })
        expect(updated).toMatchObject({ status: 'achieved', title: 'Grown' })
        expect(rows.activity_events.map(event => [event.action, event.metadata])).toEqual([
            ['goal.status_changed', { from: 'active', to: 'achieved' }],
            ['goal.updated', { fields: ['title'] }],
        ])
    })

    it('refuses to nest a goal under itself or one of its sub-goals', async () => {
        const { db, scope } = setup({ goals: [goal('a'), goal('b', { parent_goal_id: 'a' }), goal('c', { parent_goal_id: 'b' })] })
        await expect(updateGoal(scope, ME, 'a', { parentGoalId: 'a' })).rejects.toMatchObject({ code: 'goalParentInvalid' })
        await expect(updateGoal(scope, ME, 'a', { parentGoalId: 'c' })).rejects.toMatchObject({ code: 'goalParentInvalid' })
        expect(db.writes('goals')).toHaveLength(0)
        await updateGoal(scope, ME, 'c', { parentGoalId: 'a' })
        expect(db.writes('goals')[0].payload).toEqual({ parent_goal_id: 'a' })
    })

    it('writes nothing when nothing changes', async () => {
        const { db, rows, scope } = setup({ goals: [goal('grow')] })
        await updateGoal(scope, ME, 'grow', {})
        expect(db.writes('goals')).toHaveLength(0)
        expect(rows.activity_events).toHaveLength(0)
    })
})

describe('deleteGoal', () => {
    it('moves the sub-goals up to its parent before deleting it', async () => {
        const { rows, scope } = setup({ goals: [goal('company'), goal('grow', { parent_goal_id: 'company' }), goal('seo', { parent_goal_id: 'grow' })] })
        await deleteGoal(scope, ME, 'grow')
        expect(rows.goals.map(row => [row.id, row.parent_goal_id])).toEqual([
            ['company', null],
            ['seo', 'company'],
        ])
        expect(rows.activity_events[0]).toMatchObject({ action: 'goal.deleted', metadata: { title: 'grow' } })
    })
})

describe('listGoalTree', () => {
    it('rolls the issues of linked projects and the issues linked directly into a tree, counting each once', async () => {
        const { scope } = setup({
            goals: [goal('company'), goal('grow', { parent_goal_id: 'company' })],
            projects: [project('web', { goal_id: 'grow' }), project('hr', { goal_id: 'grow', visibility: 'restricted' }), project('ops')],
            issues: [
                { id: 'i1', workspace_id: WORKSPACE, project_id: 'web', status: 'done', goal_id: 'grow' },
                { id: 'i2', workspace_id: WORKSPACE, project_id: 'web', status: 'todo', goal_id: null },
                { id: 'i3', workspace_id: WORKSPACE, project_id: 'web', status: 'cancelled', goal_id: null },
                { id: 'i4', workspace_id: WORKSPACE, project_id: 'ops', status: 'done', goal_id: 'company' },
                { id: 'i5', workspace_id: WORKSPACE, project_id: 'hr', status: 'done', goal_id: 'company' },
            ],
        })

        const [company] = await listGoalTree(scope, member)

        expect(company.progress).toEqual({ open: 0, done: 1 })
        const [grow] = company.children
        expect(grow.projects).toEqual([{ id: 'web', key: 'WEB', name: 'web', status: 'active', progress: { open: 1, done: 1 } }])
        expect(grow.progress).toEqual({ open: 1, done: 1 })
        expect(company.rollup).toEqual({ open: 1, done: 2 })
    })
})
