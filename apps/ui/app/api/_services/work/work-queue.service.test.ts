import { beforeEach, describe, expect, it, vi } from 'vitest'

import { workDatabase, type Row, type Tables } from '@/test/work-fake'

vi.mock('@/lib/db', async importOriginal => ({ ...(await importOriginal<object>()), ...(await import('@/test/work-fake')).workDbHelpers }))
// Anna and the admin may use the coworkers; the outsider is a member whose Boxes do not reach them.
const access = vi.hoisted(() => ({ outsiders: new Set(['outsider']) }))
vi.mock('@/app/api/_services/work/issue-effects.service', () => ({
    reactToIssueChange: vi.fn(),
    authorMayWake: vi.fn(async (_scope: unknown, author: { kind: string; userId?: string }) => author.kind !== 'user' || !access.outsiders.has(author.userId ?? '')),
}))
vi.mock('@/lib/features', () => ({ PLATFORM_RELEASED: true }))

const { reactToIssueChange } = await import('@/app/api/_services/work/issue-effects.service')
const features = (await import('@/lib/features')) as { PLATFORM_RELEASED: boolean }
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
        session_id: null,
        ...overrides,
    }
}

const TRACKED = ['issue.created', 'issue.assigned', 'issue.status_changed', 'issue.commented', 'issue.updated', 'issue.checked_out', 'issue.run_failed']

// `issue_actor_touches` as the migration computes it, over the rows of the fake.
function issueActorTouches(rows: Tables) {
    return (args: Row) => {
        const ids = args.p_issue_ids as string[]
        const latest = new Map<string, Row>()
        for (const event of rows.activity_events) {
            if (!ids.includes(event.issue_id as string) || !TRACKED.includes(event.action as string)) continue
            const key = [event.issue_id, event.actor_user_id, event.actor_agent_id, event.action].join('/')
            const known = latest.get(key)
            if (!known || (known.last_at as string) < (event.created_at as string)) latest.set(key, { issue_id: event.issue_id, actor_user_id: event.actor_user_id, actor_agent_id: event.actor_agent_id, action: event.action, last_at: event.created_at })
        }
        return [...latest.values()]
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
        issue_comments: [],
        sessions: [],
        ...tables,
    }
    const db = workDatabase(rows, { rpc: { issue_actor_touches: issueActorTouches(rows) } })
    return { db, rows, scope: { workspaceId: WORKSPACE, db: db.scope } }
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

describe('releaseRunCheckouts and a comment made while the run held the issue', () => {
    const comment = (overrides: Row): Row => ({ id: `comment-${overrides.created_at}`, workspace_id: WORKSPACE, issue_id: 'issue-1', author_user_id: null, author_agent_id: null, body: 'Make it shorter', ...overrides })

    beforeEach(() => vi.mocked(reactToIssueChange).mockClear())

    it('wakes the coworker for a person who commented after the checkout, through the same rules as any comment', async () => {
        const { scope } = setup({ issues: [issue({ status: 'in_progress', checkout_run_id: 'run-9', checked_out_at: ago(60_000) })], issue_comments: [comment({ author_user_id: 'anna', created_at: ago(30_000) })] })

        await releaseRunCheckouts(scope, 'run-9')

        expect(reactToIssueChange).toHaveBeenCalledWith(scope, { kind: 'commented', issueId: 'issue-1', body: 'Make it shorter', author: { kind: 'user', userId: 'anna' } })
    })

    it('wakes the coworker for the newest comment of someone who may use it, never for an outsider', async () => {
        const { scope } = setup({
            issues: [issue({ status: 'in_progress', checkout_run_id: 'run-9', checked_out_at: ago(60_000) }), issue({ id: 'issue-2', number: 2, status: 'in_progress', checkout_run_id: 'run-9', checked_out_at: ago(60_000) })],
            issue_comments: [comment({ author_user_id: 'anna', created_at: ago(40_000) }), comment({ author_user_id: 'outsider', created_at: ago(20_000), body: 'Do it my way' }), comment({ issue_id: 'issue-2', author_user_id: 'outsider', created_at: ago(20_000), body: 'Drop everything' })],
        })

        await releaseRunCheckouts(scope, 'run-9')

        expect(reactToIssueChange).toHaveBeenCalledTimes(1)
        expect(reactToIssueChange).toHaveBeenCalledWith(scope, { kind: 'commented', issueId: 'issue-1', body: 'Make it shorter', author: { kind: 'user', userId: 'anna' } })
    })

    it('wakes nobody for a comment older than the checkout, or one the coworker already answered', async () => {
        const { scope } = setup({
            issues: [issue({ status: 'in_progress', checkout_run_id: 'run-9', checked_out_at: ago(60_000) }), issue({ id: 'issue-2', number: 2, status: 'in_progress', checkout_run_id: 'run-9', checked_out_at: ago(60_000) })],
            issue_comments: [comment({ author_user_id: 'anna', created_at: ago(90_000) }), comment({ issue_id: 'issue-2', author_user_id: 'anna', created_at: ago(30_000) }), comment({ issue_id: 'issue-2', author_agent_id: 'agent-1', created_at: ago(10_000) })],
        })

        expect(await releaseRunCheckouts(scope, 'run-9')).toBe(2)

        expect(reactToIssueChange).not.toHaveBeenCalled()
    })
})

describe('releaseStaleCheckouts and a run paused on a person', () => {
    it('keeps the checkout while the issue conversation waits on a person, and lets it go once it does not', async () => {
        const { rows, scope } = setup({
            issues: [issue({ id: 'asking', checkout_run_id: 'run-asking', checked_out_at: ago(MAX_CHECKOUT_AGE_MS + 1000), session_id: 'session-asking' }), issue({ id: 'answered', number: 2, checkout_run_id: 'run-done', checked_out_at: ago(STALE_CHECKOUT_GRACE_MS + 1000), session_id: 'session-idle' })],
            sessions: [
                { id: 'session-asking', status: 'awaiting_question' },
                { id: 'session-idle', status: 'idle' },
            ],
        })

        expect(await releaseStaleCheckouts(scope, [], NOW)).toBe(1)

        expect(Object.fromEntries(rows.issues.map(row => [row.id, row.checkout_run_id]))).toEqual({ asking: 'run-asking', answered: null })
    })
})

describe('isDue', () => {
    const touches = (assignee: number | null, others: number | null, personComment: number | null = null) => ({
        assigneeTouchedAt: assignee === null ? null : ago(assignee),
        othersTouchedAt: others === null ? null : ago(others),
        personCommentedAt: personComment === null ? null : ago(personComment),
    })

    it('hands an issue the coworker never touched', () => {
        expect(isDue({ status: 'todo' }, touches(null, null), NOW)).toBe(true)
        expect(isDue({ status: 'todo' }, touches(null, 1000), NOW)).toBe(true)
    })

    it('waits once the coworker acted, until someone else does or a day goes by', () => {
        expect(isDue({ status: 'todo' }, touches(60_000, null), NOW)).toBe(false)
        expect(isDue({ status: 'todo' }, touches(60_000, 1000), NOW)).toBe(true)
        expect(isDue({ status: 'todo' }, touches(60_000, 120_000), NOW)).toBe(false)
        expect(isDue({ status: 'in_progress' }, touches(NUDGE_AFTER_MS + 1000, null), NOW)).toBe(true)
    })

    it('leaves a blocked issue alone until someone else moves, and whenever its touches are unknown', () => {
        expect(isDue({ status: 'blocked' }, touches(NUDGE_AFTER_MS * 3, null), NOW)).toBe(false)
        expect(isDue({ status: 'blocked' }, touches(NUDGE_AFTER_MS * 3, 1000), NOW)).toBe(true)
        expect(isDue({ status: 'blocked' }, undefined, NOW)).toBe(false)
        expect(isDue({ status: 'todo' }, undefined, NOW)).toBe(false)
    })

    it('never starts a failed run again on its own, the daily nudge included, until someone else acts', () => {
        const failed = (assignee: number, failedAgo: number, others: number | null = null) => ({ ...touches(assignee, others), assigneeFailedAt: ago(failedAgo) })
        expect(isDue({ status: 'todo' }, failed(NUDGE_AFTER_MS * 3, NUDGE_AFTER_MS * 3), NOW)).toBe(false)
        expect(isDue({ status: 'in_progress' }, failed(NUDGE_AFTER_MS * 3, NUDGE_AFTER_MS * 3), NOW)).toBe(false)
        expect(isDue({ status: 'todo' }, failed(NUDGE_AFTER_MS * 3, NUDGE_AFTER_MS * 3, 1000), NOW)).toBe(true)
        expect(isDue({ status: 'todo' }, failed(NUDGE_AFTER_MS + 1000, NUDGE_AFTER_MS * 3), NOW)).toBe(true)
    })

    it('hands an issue in review only for a person who commented after the coworker last touched it', () => {
        expect(isDue({ status: 'in_review' }, touches(60_000, 1000), NOW)).toBe(false)
        expect(isDue({ status: 'in_review' }, touches(60_000, 1000, 1000), NOW)).toBe(true)
        expect(isDue({ status: 'in_review' }, touches(1000, 60_000, 60_000), NOW)).toBe(false)
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

    it('does not take an old issue for untouched because the workspace is busy elsewhere', async () => {
        const busy = Array.from({ length: 2500 }, (_, n) => event('other', 'issue.updated', { user: 'anna' }, ago(1000 + n)))
        const { scope } = setup({
            issues: [issue({ id: 'old', status: 'blocked' }), issue({ id: 'other', number: 2, assignee_agent_id: 'agent-2', status: 'blocked' })],
            activity_events: [event('old', 'issue.status_changed', { agent: 'agent-1' }, ago(NUDGE_AFTER_MS * 5)), event('other', 'issue.status_changed', { agent: 'agent-2' }, ago(NUDGE_AFTER_MS * 6)), ...busy],
        })

        const runs = await nextIssuesFor(scope, [{ agentId: 'engine-1', skipRefs: [] }], NOW)

        expect(runs).toEqual([])
    })

    it('hands an issue in review to its coworker when a person commented after its last touch', async () => {
        const { scope } = setup({
            issues: [issue({ status: 'in_review' })],
            activity_events: [event('issue-1', 'issue.status_changed', { agent: 'agent-1' }, ago(60_000)), event('issue-1', 'issue.commented', { user: 'anna' }, ago(1000))],
        })
        expect(await nextIssuesFor(scope, [{ agentId: 'engine-1', skipRefs: [] }], NOW)).toEqual([{ agentId: 'engine-1', ref: 'ENG-1', title: 'Write the launch post' }])
    })

    it('never hands out an issue whose conversation waits on a person', async () => {
        const { scope } = setup({ issues: [issue({ session_id: 'session-asking' })], sessions: [{ id: 'session-asking', status: 'awaiting_approval' }] })
        expect(await nextIssuesFor(scope, [{ agentId: 'engine-1', skipRefs: [] }], NOW)).toEqual([])
    })

    it('hands back an issue within the cooldown only when someone else touched it after the wake', async () => {
        const wokenAt = { 'ENG-1': ago(30 * 60_000) }
        const before = setup({ issues: [issue()], activity_events: [event('issue-1', 'issue.assigned', { user: 'anna' }, ago(40 * 60_000))] })
        expect(await nextIssuesFor(before.scope, [{ agentId: 'engine-1', skipRefs: ['ENG-1'], wokenAt }], NOW)).toEqual([])

        const after = setup({ issues: [issue()], activity_events: [event('issue-1', 'issue.checked_out', { agent: 'agent-1' }, ago(29 * 60_000)), event('issue-1', 'issue.commented', { user: 'anna' }, ago(5 * 60_000))] })
        expect(await nextIssuesFor(after.scope, [{ agentId: 'engine-1', skipRefs: ['ENG-1'], wokenAt }], NOW)).toEqual([{ agentId: 'engine-1', ref: 'ENG-1', title: 'Write the launch post' }])
        expect(await nextIssuesFor(after.scope, [{ agentId: 'engine-1', skipRefs: ['ENG-1'] }], NOW)).toEqual([])
    })

    it('lets only a person who may use the coworker, an admin, another coworker or the system make an issue due', async () => {
        const touched = event('issue-1', 'issue.status_changed', { agent: 'agent-1' }, ago(60_000))
        const due = async (actor: { agent?: string; user?: string }, action = 'issue.commented', status = 'blocked') => {
            const { scope } = setup({ issues: [issue({ status })], activity_events: [touched, event('issue-1', action, actor, ago(1000))] })
            return (await nextIssuesFor(scope, [{ agentId: 'engine-1', skipRefs: [] }], NOW)).length === 1
        }
        expect(await due({ user: 'outsider' })).toBe(false)
        expect(await due({ user: 'outsider' }, 'issue.status_changed')).toBe(false)
        expect(await due({ user: 'outsider' }, 'issue.commented', 'in_review')).toBe(false)
        expect(await due({ user: 'anna' })).toBe(true)
        expect(await due({ user: 'admin' })).toBe(true)
        expect(await due({ user: 'anna' }, 'issue.commented', 'in_review')).toBe(true)
        expect(await due({ agent: 'agent-2' })).toBe(true)
        expect(await due({})).toBe(true)
    })

    it('keeps the cooldown for an issue only an outsider touched after the wake', async () => {
        const wokenAt = { 'ENG-1': ago(30 * 60_000) }
        const outsider = setup({ issues: [issue()], activity_events: [event('issue-1', 'issue.checked_out', { agent: 'agent-1' }, ago(29 * 60_000)), event('issue-1', 'issue.commented', { user: 'outsider' }, ago(5 * 60_000))] })
        expect(await nextIssuesFor(outsider.scope, [{ agentId: 'engine-1', skipRefs: ['ENG-1'], wokenAt }], NOW)).toEqual([])
        const member = setup({ issues: [issue()], activity_events: [event('issue-1', 'issue.checked_out', { agent: 'agent-1' }, ago(29 * 60_000)), event('issue-1', 'issue.commented', { user: 'admin' }, ago(5 * 60_000))] })
        expect(await nextIssuesFor(member.scope, [{ agentId: 'engine-1', skipRefs: ['ENG-1'], wokenAt }], NOW)).toHaveLength(1)
    })

    it('does not start a failed run again after an engine restart, which forgot its cooldown', async () => {
        const failure = event('issue-1', 'issue.run_failed', { agent: 'agent-1' }, ago(2 * 60_000))
        const restarted = setup({ issues: [issue()], activity_events: [event('issue-1', 'issue.assigned', { user: 'anna' }, ago(3 * 60_000)), failure] })
        expect(await nextIssuesFor(restarted.scope, [{ agentId: 'engine-1', skipRefs: [] }], NOW)).toEqual([])
        expect(await nextIssuesFor(restarted.scope, [{ agentId: 'engine-1', skipRefs: [] }], NOW + NUDGE_AFTER_MS * 2)).toEqual([])

        const touchedAfter = setup({ issues: [issue()], activity_events: [failure, event('issue-1', 'issue.commented', { user: 'anna' }, ago(1000))] })
        expect(await nextIssuesFor(touchedAfter.scope, [{ agentId: 'engine-1', skipRefs: [] }], NOW)).toEqual([{ agentId: 'engine-1', ref: 'ENG-1', title: 'Write the launch post' }])

        const outsiderAfter = setup({ issues: [issue()], activity_events: [failure, event('issue-1', 'issue.commented', { user: 'outsider' }, ago(1000))] })
        expect(await nextIssuesFor(outsiderAfter.scope, [{ agentId: 'engine-1', skipRefs: [] }], NOW)).toEqual([])
    })

    it('hands out nothing when the touches cannot be read', async () => {
        const { db, scope } = setup({ issues: [issue()] })
        db.helpers.callRows = async () => ({ data: null, error: { message: 'down' } })
        await expect(nextIssuesFor(scope, [{ agentId: 'engine-1', skipRefs: [] }], NOW)).rejects.toThrow('Failed to read when the issues were last touched')
    })

    it('hands out nothing with the platform switched off', async () => {
        const { scope } = setup({ issues: [issue()] })
        features.PLATFORM_RELEASED = false
        try {
            expect(await nextIssuesFor(scope, [{ agentId: 'engine-1', skipRefs: [] }], NOW)).toEqual([])
        } finally {
            features.PLATFORM_RELEASED = true
        }
    })

    it('answers nothing for nobody, an unknown coworker or a coworker with nothing open', async () => {
        const { scope } = setup()
        expect(await nextIssuesFor(scope, [], NOW)).toEqual([])
        expect(await nextIssuesFor(scope, [{ agentId: 'engine-ghost', skipRefs: [] }], NOW)).toEqual([])
        expect(await nextIssuesFor(scope, [{ agentId: 'engine-1', skipRefs: [] }], NOW)).toEqual([])
    })
})
