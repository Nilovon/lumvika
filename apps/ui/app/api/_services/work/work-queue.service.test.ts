import { describe, expect, it, vi } from 'vitest'

import { workDatabase, type Row, type Tables } from '@/test/work-fake'

vi.mock('@/supabase/serviceRole', () => ({ createServiceRoleClient: vi.fn() }))
vi.mock('@/app/api/_services/work/issue-effects.service', () => ({ reactToIssueChange: vi.fn() }))

const { MAX_CHECKOUT_AGE_MS, NUDGE_AFTER_MS, STALE_CHECKOUT_GRACE_MS, isDue, nextIssuesFor, releaseRunCheckouts, releaseStaleCheckouts } = await import('./work-queue.service')

const WORKSPACE = 7
const NOW = Date.parse('2026-11-12T12:00:00.000Z')
const ago = (ms: number) => new Date(NOW - ms).toISOString()

function issue(overrides: Row = {}): Row {
    return {
        id: 'issue-1',
        workspace_id: WORKSPACE,
        project_id: 'project-1',
        number: 1,
        title: 'Write the launch post',
        status: 'todo',
        priority: 'none',
        due_date: null,
        position: 1024,
        assignee_agent_id: 'agent-1',
        assignee_user_id: null,
        checkout_run_id: null,
        checked_out_at: null,
        ...overrides,
    }
}

function setup(tables: Partial<Tables> = {}) {
    const rows: Tables = {
        projects: [
            { id: 'project-1', workspace_id: WORKSPACE, key: 'ENG', archived_at: null },
            { id: 'project-2', workspace_id: WORKSPACE, key: 'OLD', archived_at: ago(1000) },
        ],
        agents: [
            { id: 'agent-1', workspace_id: WORKSPACE, engine_agent_id: 'engine-1', disabled_at: null },
            { id: 'agent-2', workspace_id: WORKSPACE, engine_agent_id: 'engine-2', disabled_at: null },
            { id: 'agent-off', workspace_id: WORKSPACE, engine_agent_id: 'engine-off', disabled_at: ago(1000) },
            { id: 'agent-other', workspace_id: 99, engine_agent_id: 'engine-other', disabled_at: null },
        ],
        issues: [],
        activity_events: [],
        ...tables,
    }
    const db = workDatabase(rows)
    return { db, rows, scope: { workspaceId: WORKSPACE, supabase: db.client } }
}

const event = (issueId: string, action: string, actor: { agent?: string; user?: string }, at: string): Row => ({ id: `${issueId}-${action}-${at}`, workspace_id: WORKSPACE, issue_id: issueId, action, actor_agent_id: actor.agent ?? null, actor_user_id: actor.user ?? null, created_at: at })

describe('releaseRunCheckouts', () => {
    it('lets go of every issue the run held, and logs it as Lumvika', async () => {
        const { rows, scope } = setup({ issues: [issue({ checkout_run_id: 'run-9', checked_out_at: ago(5000) }), issue({ id: 'issue-2', number: 2, checkout_run_id: 'run-other', checked_out_at: ago(5000) })] })

        expect(await releaseRunCheckouts(scope, 'run-9')).toBe(1)

        expect(rows.issues.map(row => row.checkout_run_id)).toEqual([null, 'run-other'])
        expect(rows.activity_events).toEqual([expect.objectContaining({ action: 'issue.released', issue_id: 'issue-1', actor_agent_id: null, actor_user_id: null, metadata: expect.objectContaining({ runId: 'run-9' }) })])
    })
})

describe('releaseStaleCheckouts', () => {
    it('lets go of what no live run holds past the grace, and of anything held for a day', async () => {
        const { rows, scope } = setup({
            issues: [
                issue({ id: 'live', checkout_run_id: 'run-live', checked_out_at: ago(60 * 60_000) }),
                issue({ id: 'dead', number: 2, checkout_run_id: 'run-dead', checked_out_at: ago(STALE_CHECKOUT_GRACE_MS + 1000) }),
                issue({ id: 'fresh', number: 3, checkout_run_id: 'run-fresh', checked_out_at: ago(60_000) }),
                issue({ id: 'ancient', number: 4, checkout_run_id: 'run-ancient', checked_out_at: ago(MAX_CHECKOUT_AGE_MS + 1000) }),
                issue({ id: 'free', number: 5 }),
            ],
        })

        expect(await releaseStaleCheckouts(scope, ['run-live', 'run-ancient'], NOW)).toBe(2)

        expect(Object.fromEntries(rows.issues.map(row => [row.id, row.checkout_run_id]))).toEqual({ live: 'run-live', dead: null, fresh: 'run-fresh', ancient: null, free: null })
    })
})

describe('isDue', () => {
    const mine = { status: 'todo' as const, assignee_agent_id: 'agent-1' }

    it('hands an issue the coworker never touched, including one it filed for itself', () => {
        expect(isDue(mine, [], NOW)).toBe(true)
        expect(isDue(mine, [event('i', 'issue.created', { agent: 'agent-1' }, ago(1000)) as never], NOW)).toBe(true)
    })

    it('waits once the coworker acted, until someone else does or a day goes by', () => {
        const touched = event('i', 'issue.checked_out', { agent: 'agent-1' }, ago(60_000)) as never
        expect(isDue(mine, [touched], NOW)).toBe(false)
        expect(isDue(mine, [touched, event('i', 'issue.commented', { user: 'anna' }, ago(1000)) as never], NOW)).toBe(true)
        expect(isDue(mine, [touched, event('i', 'issue.commented', { user: 'anna' }, ago(120_000)) as never], NOW)).toBe(false)
        expect(isDue(mine, [event('i', 'issue.commented', { agent: 'agent-1' }, ago(NUDGE_AFTER_MS + 1000)) as never], NOW)).toBe(true)
    })

    it('leaves a blocked issue alone until someone else moves', () => {
        const blocked = { ...mine, status: 'blocked' as const }
        const touched = event('i', 'issue.status_changed', { agent: 'agent-1' }, ago(NUDGE_AFTER_MS * 3)) as never
        expect(isDue(blocked, [touched], NOW)).toBe(false)
        expect(isDue(blocked, [touched, event('i', 'issue.commented', { agent: 'agent-2' }, ago(1000)) as never], NOW)).toBe(true)
    })
})

describe('nextIssuesFor', () => {
    it('hands each idle coworker the first due issue of its inbox, by engine id', async () => {
        const { scope } = setup({
            issues: [
                issue({ id: 'low-todo', number: 1, priority: 'low' }),
                issue({ id: 'urgent-todo', number: 2, priority: 'urgent' }),
                issue({ id: 'progress', number: 3, status: 'in_progress', priority: 'none' }),
                issue({ id: 'held', number: 4, status: 'in_progress', priority: 'urgent', checkout_run_id: 'run-1', checked_out_at: ago(1000) }),
                issue({ id: 'review', number: 5, status: 'in_review' }),
                issue({ id: 'archived', number: 6, project_id: 'project-2', status: 'in_progress' }),
                issue({ id: 'other', number: 7, assignee_agent_id: 'agent-2', due_date: '2026-11-20' }),
                issue({ id: 'other-sooner', number: 8, assignee_agent_id: 'agent-2', due_date: '2026-11-13' }),
                issue({ id: 'disabled', number: 9, assignee_agent_id: 'agent-off' }),
            ],
            activity_events: [event('progress', 'issue.checked_out', { agent: 'agent-1' }, ago(60_000))],
        })

        const runs = await nextIssuesFor(
            scope,
            [
                { agentId: 'engine-1', skipRefs: [] },
                { agentId: 'engine-2', skipRefs: ['eng-8'] },
                { agentId: 'engine-off', skipRefs: [] },
                { agentId: 'engine-other', skipRefs: [] },
            ],
            NOW,
        )

        expect(runs).toEqual([
            { agentId: 'engine-1', ref: 'ENG-2', title: 'Write the launch post' },
            { agentId: 'engine-2', ref: 'ENG-7', title: 'Write the launch post' },
        ])
    })

    it('answers nothing for nobody, an unknown coworker or a coworker with nothing open', async () => {
        const { scope } = setup()
        expect(await nextIssuesFor(scope, [], NOW)).toEqual([])
        expect(await nextIssuesFor(scope, [{ agentId: 'engine-ghost', skipRefs: [] }], NOW)).toEqual([])
        expect(await nextIssuesFor(scope, [{ agentId: 'engine-1', skipRefs: [] }], NOW)).toEqual([])
    })
})
