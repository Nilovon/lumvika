import { describe, expect, it, vi } from 'vitest'

import { workDatabase, type Row } from '@/test/work-fake'
import { issueRow, projectRow, WORKSPACE } from '@/test/work-rows'

vi.mock('@/supabase/serviceRole', () => ({ createServiceRoleClient: vi.fn() }))

const { getWorkOverview } = await import('./overview.service')

const NOW = new Date('2026-11-12T12:00:00.000Z')
const ACTOR = { kind: 'user', userId: 'me', workspaceId: WORKSPACE, role: 'member', boxScope: 'all' } as const

function goal(overrides: Row): Row {
    return { workspace_id: WORKSPACE, parent_goal_id: null, team_id: null, description: null, owner_user_id: null, target_date: null, created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z', ...overrides }
}

function setup() {
    const issues = [
        issueRow({ id: 'a', status: 'in_review', created_at: '2026-11-11T09:00:00.000Z' }),
        issueRow({ id: 'b', number: 2, status: 'blocked', assignee_user_id: 'me' }),
        issueRow({ id: 'c', number: 3, status: 'done', completed_at: '2026-11-12T08:00:00.000Z', created_at: '2026-10-01T00:00:00.000Z' }),
        issueRow({ id: 'd', number: 4, status: 'in_progress', assignee_agent_id: 'scout', checkout_run_id: 'run-1', checked_out_at: '2026-11-12T11:00:00.000Z', title: 'Research pricing' }),
        issueRow({ id: 'e', number: 5, status: 'todo', assignee_user_id: 'me', goal_id: 'goal-direct' }),
        issueRow({ id: 'h', project_id: 'hidden', status: 'in_review', assignee_user_id: 'me', assignee_agent_id: 'quill', checkout_run_id: 'run-2', created_at: '2026-11-12T00:00:00.000Z' }),
    ]
    const counts = (projectId: string) =>
        Object.entries(
            issues
                .filter(issue => issue.project_id === projectId)
                .reduce<Record<string, number>>((byStatus, issue) => ({ ...byStatus, [issue.status as string]: (byStatus[issue.status as string] ?? 0) + 1 }), {}),
        ).map(([status, issue_count]) => ({ project_id: projectId, status, issue_count }))
    const db = workDatabase(
        {
            projects: [projectRow({ goal_id: 'goal-1' }), projectRow({ id: 'paused', key: 'OLD', name: 'Paused', status: 'paused' }), projectRow({ id: 'hidden', key: 'SEC', name: 'Hidden' })],
            issues,
            goals: [goal({ id: 'goal-1', title: 'Launch', status: 'active' }), goal({ id: 'goal-direct', title: 'Grow', status: 'active', parent_goal_id: 'goal-1' }), goal({ id: 'goal-done', title: 'Old', status: 'achieved' })],
            activity_events: [{ id: 'e1', workspace_id: WORKSPACE, project_id: 'project-1', issue_id: 'a', entity_type: 'issue', entity_id: 'a', action: 'issue.created', actor_user_id: 'me', actor_agent_id: null, metadata: {}, created_at: '2026-11-11T09:00:00.000Z' }],
        },
        { rpc: { project_issue_counts: () => [...counts('project-1'), ...counts('hidden')] } },
    )
    return { workspaceId: WORKSPACE, supabase: db.client }
}

describe('getWorkOverview', () => {
    it('counts what needs me and sums the projects I see', async () => {
        const overview = await getWorkOverview(setup(), ACTOR, { projects: new Set(['project-1', 'paused']), channels: 'all' }, NOW)

        expect(overview.counts).toEqual({ toReview: 1, blocked: 1, assignedToMe: 2 })
        expect(overview.projectCount).toBe(2)
        expect(overview.activeProjects).toEqual([expect.objectContaining({ key: 'ENG', done: 1, total: 5, inReview: 1, blocked: 1 })])
        expect(overview.checkouts).toEqual([{ agentId: 'scout', issueId: 'd', ref: 'ENG-4', title: 'Research pricing', checkedOutAt: '2026-11-12T11:00:00.000Z' }])
    })

    it('rolls the active goals up and keeps the window of the throughput', async () => {
        const overview = await getWorkOverview(setup(), ACTOR, { projects: new Set(['project-1']), channels: 'all' }, NOW)

        expect(overview.goals.map(goal => [goal.title, goal.rollup])).toEqual([
            ['Launch', { open: 5, done: 1 }],
            ['Grow', { open: 1, done: 0 }],
        ])
        expect(overview.throughput.completed).toEqual(['2026-11-12T08:00:00.000Z'])
        expect(overview.throughput.created).not.toContain('2026-10-01T00:00:00.000Z')
        expect(overview.throughput.created).not.toContain('2026-11-12T00:00:00.000Z')
        expect(overview.recent.events.map(event => event.id)).toEqual(['e1'])
        expect(overview.recent.refs.issues.a).toEqual({ ref: 'ENG-1', title: 'Write the launch post' })
    })
})
