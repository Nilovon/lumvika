import { ISSUE_STATUSES, canTransitionIssue, formatIssueRef, parseIssueRef } from '@lumvika/contracts'
import { describe, expect, it, vi } from 'vitest'

import { workDatabase, type Row, type Tables } from '@/test/work-fake'

vi.mock('@/supabase/serviceRole', () => ({ createServiceRoleClient: vi.fn() }))

const { assignIssue, checkoutIssue, createIssue, createSubIssue, getIssueByRef, issueStatusPatch, listIssues, moveIssue, releaseIssue, transitionIssue, updateIssue, ISSUE_POSITION_STEP } = await import('./issues.service')

const WORKSPACE = 7
const ME = { kind: 'user', userId: 'me' } as const
const AGENT = 'agent-1'

function issue(overrides: Row = {}): Row {
    return {
        id: 'issue-1',
        workspace_id: WORKSPACE,
        project_id: 'project-1',
        number: 1,
        title: 'Write the launch post',
        description: null,
        status: 'todo',
        priority: 'none',
        assignee_user_id: null,
        assignee_agent_id: null,
        created_by_user_id: 'me',
        created_by_agent_id: null,
        parent_issue_id: null,
        goal_id: null,
        due_date: null,
        position: 1024,
        blocked_reason: null,
        checkout_run_id: null,
        checked_out_at: null,
        session_id: null,
        started_at: null,
        completed_at: null,
        created_at: '2026-11-01T00:00:00.000Z',
        updated_at: '2026-11-01T00:00:00.000Z',
        ...overrides,
    }
}

function setup(tables: Partial<Tables> = {}) {
    const rows: Tables = {
        projects: [
            { id: 'project-1', workspace_id: WORKSPACE, key: 'ENG', archived_at: null, issue_counter: 1 },
            { id: 'project-2', workspace_id: WORKSPACE, key: 'OPS', archived_at: '2026-10-01T00:00:00.000Z', issue_counter: 0 },
        ],
        workspace_members: [{ user_id: 'me', workspace_id: WORKSPACE }],
        agents: [{ id: AGENT, workspace_id: WORKSPACE }],
        activity_events: [],
        issues: [],
        ...tables,
    }
    const db = workDatabase(rows, {
        onInsert: {
            issues: row => {
                const project = rows.projects.find(candidate => candidate.id === row.project_id)!
                project.issue_counter = (project.issue_counter as number) + 1
                Object.assign(row, issue({ ...row, number: project.issue_counter }), { id: row.id })
            },
        },
    })
    return { db, rows, scope: { workspaceId: WORKSPACE, supabase: db.client } }
}

const actions = (rows: Tables) => rows.activity_events.map(event => event.action)

describe('the issue contracts', () => {
    it('allows exactly the edges of the matrix', () => {
        expect(canTransitionIssue('backlog', 'todo')).toBe(true)
        expect(canTransitionIssue('backlog', 'done')).toBe(false)
        expect(canTransitionIssue('done', 'todo')).toBe(true)
        expect(canTransitionIssue('cancelled', 'todo')).toBe(false)
        for (const status of ISSUE_STATUSES) expect(canTransitionIssue(status, status)).toBe(false)
    })

    it('reads and writes references', () => {
        expect(formatIssueRef('ENG', 12)).toBe('ENG-12')
        expect(parseIssueRef(' eng-12 ')).toEqual({ projectKey: 'ENG', number: 12 })
        expect(parseIssueRef('ENG-0')).toBeNull()
        expect(parseIssueRef('1NG-3')).toBeNull()
        expect(parseIssueRef('ENGINEERING-3')).toBeNull()
    })
})

describe('issueStatusPatch', () => {
    const now = '2026-11-12T10:00:00.000Z'
    const fresh = { started_at: null, completed_at: null, blocked_reason: null, checkout_run_id: null }

    it('stamps the first start and the completion', () => {
        expect(issueStatusPatch(fresh, 'in_progress', undefined, now)).toEqual({ status: 'in_progress', started_at: now })
        expect(issueStatusPatch({ ...fresh, started_at: 'earlier' }, 'in_progress', undefined, now)).toEqual({ status: 'in_progress' })
        expect(issueStatusPatch(fresh, 'done', undefined, now)).toEqual({ status: 'done', completed_at: now })
        expect(issueStatusPatch({ ...fresh, completed_at: now }, 'todo', undefined, now)).toEqual({ status: 'todo', completed_at: null })
    })

    it('keeps the blocked reason only while blocked, and a checkout only where an agent works', () => {
        expect(issueStatusPatch(fresh, 'blocked', 'Waiting for the API key', now)).toEqual({ status: 'blocked', blocked_reason: 'Waiting for the API key' })
        expect(issueStatusPatch({ ...fresh, blocked_reason: 'x' }, 'todo', undefined, now)).toEqual({ status: 'todo', blocked_reason: null })
        expect(issueStatusPatch({ ...fresh, checkout_run_id: 'run-1' }, 'in_review', undefined, now)).toMatchObject({ checkout_run_id: null, checked_out_at: null })
        expect(issueStatusPatch({ ...fresh, checkout_run_id: 'run-1' }, 'blocked', undefined, now)).not.toHaveProperty('checkout_run_id')
    })
})

describe('createIssue', () => {
    it('puts the new issue at the end of its column and logs it', async () => {
        const { db, rows, scope } = setup({ issues: [issue({ status: 'backlog', position: 3000 })] })

        const created = await createIssue(scope, ME, { projectId: 'project-1', title: '  Ship it  ', assignee: { kind: 'agent', agentId: AGENT } })

        expect(created.ref).toBe('ENG-2')
        const [insert] = db.writes('issues')
        expect(insert.payload).toMatchObject({ title: 'Ship it', status: 'backlog', position: 3000 + ISSUE_POSITION_STEP, assignee_agent_id: AGENT, assignee_user_id: null, created_by_user_id: 'me' })
        expect(rows.activity_events[0]).toMatchObject({ action: 'issue.created', entity_type: 'issue', entity_id: created.id, project_id: 'project-1', actor_user_id: 'me', metadata: { ref: 'ENG-2' } })
    })

    it('refuses an archived project, an outside assignee and a parent of another project', async () => {
        const { db, scope } = setup({ issues: [issue({ id: 'other-parent', project_id: 'project-2' })] })

        await expect(createIssue(scope, ME, { projectId: 'project-2', title: 'x' })).rejects.toMatchObject({ code: 'projectArchived' })
        await expect(createIssue(scope, ME, { projectId: 'project-1', title: 'x', assignee: { kind: 'user', userId: 'stranger' } })).rejects.toMatchObject({ code: 'assigneeNotInWorkspace' })
        await expect(createIssue(scope, ME, { projectId: 'project-1', title: 'x', parentIssueId: 'other-parent' })).rejects.toMatchObject({ code: 'issueParentInvalid' })
        await expect(createIssue(scope, ME, { projectId: 'project-1', title: '   ' })).rejects.toMatchObject({ code: 'titleRequired' })
        expect(db.writes('issues')).toHaveLength(0)
    })

    it('creates a sub-issue in its parent project', async () => {
        const { db, scope } = setup({ issues: [issue()] })
        await createSubIssue(scope, ME, 'issue-1', { title: 'Draft' })
        expect(db.writes('issues')[0].payload).toMatchObject({ project_id: 'project-1', parent_issue_id: 'issue-1' })
    })
})

describe('updateIssue', () => {
    it('refuses to make an issue its own ancestor', async () => {
        const { scope } = setup({ issues: [issue(), issue({ id: 'child', number: 2, parent_issue_id: 'issue-1' })] })
        await expect(updateIssue(scope, ME, 'issue-1', { parentIssueId: 'child' })).rejects.toMatchObject({ code: 'issueParentInvalid' })
    })

    it('writes only what changed and logs the fields', async () => {
        const { db, rows, scope } = setup({ issues: [issue()] })
        await updateIssue(scope, ME, 'issue-1', { priority: 'high' })
        expect(db.writes('issues')[0].payload).toEqual({ priority: 'high' })
        expect(rows.activity_events[0]).toMatchObject({ action: 'issue.updated', metadata: { fields: ['priority'] } })
    })
})

describe('transitionIssue', () => {
    it('refuses a move the matrix does not allow', async () => {
        const { db, scope } = setup({ issues: [issue({ status: 'backlog' })] })
        await expect(transitionIssue(scope, ME, 'issue-1', 'done')).rejects.toMatchObject({ code: 'issueTransitionNotAllowed' })
        expect(db.writes('issues')).toHaveLength(0)
    })

    it('moves, stamps the start, and writes only if nobody moved it meanwhile', async () => {
        const { db, rows, scope } = setup({ issues: [issue()] })

        const moved = await transitionIssue(scope, ME, 'issue-1', 'in_progress')

        expect(moved.status).toBe('in_progress')
        expect(moved.started_at).toEqual(expect.any(String))
        const [write] = db.writes('issues')
        expect(write.filters).toContainEqual({ table: 'issues', method: 'eq', args: ['status', 'todo'] })
        expect(rows.activity_events[0]).toMatchObject({ action: 'issue.status_changed', metadata: { from: 'todo', to: 'in_progress' } })
    })

    it('treats the same status as nothing to do', async () => {
        const { db, scope } = setup({ issues: [issue()] })
        await transitionIssue(scope, ME, 'issue-1', 'todo')
        expect(db.writes('issues')).toHaveLength(0)
    })
})

describe('moveIssue', () => {
    it('reorders inside a column without logging', async () => {
        const { rows, scope } = setup({ issues: [issue()] })
        const moved = await moveIssue(scope, ME, 'issue-1', { status: 'todo', position: 12.5 })
        expect(moved.position).toBe(12.5)
        expect(rows.activity_events).toHaveLength(0)
    })

    it('goes through the matrix when the column changes', async () => {
        const { rows, scope } = setup({ issues: [issue()] })
        await expect(moveIssue(scope, ME, 'issue-1', { status: 'done', position: 1 })).rejects.toMatchObject({ code: 'issueTransitionNotAllowed' })
        await moveIssue(scope, ME, 'issue-1', { status: 'in_progress', position: 7 })
        expect(rows.issues[0]).toMatchObject({ status: 'in_progress', position: 7 })
        expect(actions(rows)).toEqual(['issue.status_changed'])
    })
})

describe('assignIssue', () => {
    it('sets one assignee, clears the other and ends a checkout', async () => {
        const { db, rows, scope } = setup({ issues: [issue({ assignee_agent_id: AGENT, checkout_run_id: 'run-1', checked_out_at: 'now' })] })

        await assignIssue(scope, ME, 'issue-1', { kind: 'user', userId: 'me' })

        expect(db.writes('issues')[0].payload).toEqual({ assignee_user_id: 'me', assignee_agent_id: null, checkout_run_id: null, checked_out_at: null })
        expect(rows.activity_events[0]).toMatchObject({ action: 'issue.assigned', metadata: { assignee: { kind: 'user', userId: 'me' }, previous: { kind: 'agent', agentId: AGENT } } })
    })

    it('does nothing when the assignee does not change', async () => {
        const { db, scope } = setup({ issues: [issue({ assignee_user_id: 'me' })] })
        await assignIssue(scope, ME, 'issue-1', { kind: 'user', userId: 'me' })
        expect(db.writes('issues')).toHaveLength(0)
    })
})

describe('checkoutIssue', () => {
    it('takes the issue in one conditional update', async () => {
        const { db, rows, scope } = setup({ issues: [issue({ assignee_agent_id: AGENT, status: 'blocked', blocked_reason: 'waiting' })] })

        const result = await checkoutIssue(scope, 'issue-1', AGENT, 'run-1', { sessionId: 'session-1' })

        expect(result).toMatchObject({ ok: true, issue: { ref: 'ENG-1', status: 'in_progress', checkout_run_id: 'run-1', session_id: 'session-1', blocked_reason: null } })
        const [checkout] = db.writes('issues')
        expect(checkout.filters.map(call => [call.method, call.args[0]])).toEqual(expect.arrayContaining([['eq', 'assignee_agent_id'], ['in', 'status'], ['is', 'checkout_run_id']]))
        expect(rows.issues[0].started_at).toEqual(expect.any(String))
        expect(actions(rows)).toEqual(['issue.checked_out'])
    })

    it('names the conflict when it cannot', async () => {
        const { scope } = setup({
            issues: [
                issue({ id: 'held', assignee_agent_id: AGENT, checkout_run_id: 'run-0', checked_out_at: 'then' }),
                issue({ id: 'someone-else', number: 2, assignee_user_id: 'me' }),
                issue({ id: 'review', number: 3, assignee_agent_id: AGENT, status: 'in_review' }),
            ],
        })

        await expect(checkoutIssue(scope, 'held', AGENT, 'run-1')).resolves.toEqual({ ok: false, reason: 'checked_out', heldByRunId: 'run-0' })
        await expect(checkoutIssue(scope, 'held', AGENT, 'run-0')).resolves.toMatchObject({ ok: true })
        await expect(checkoutIssue(scope, 'someone-else', AGENT, 'run-1')).resolves.toMatchObject({ ok: false, reason: 'not_assigned' })
        await expect(checkoutIssue(scope, 'review', AGENT, 'run-1')).resolves.toMatchObject({ ok: false, reason: 'not_ready' })
        await expect(checkoutIssue(scope, 'missing', AGENT, 'run-1')).resolves.toMatchObject({ ok: false, reason: 'not_found' })
    })
})

describe('releaseIssue', () => {
    it('lets go only of the run named', async () => {
        const { rows, scope } = setup({ issues: [issue({ assignee_agent_id: AGENT, checkout_run_id: 'run-1', checked_out_at: 'then' })] })

        await expect(releaseIssue(scope, { kind: 'agent', agentId: AGENT }, 'issue-1', { runId: 'run-2' })).resolves.toEqual({ ok: false, reason: 'not_checked_out' })
        await expect(releaseIssue(scope, { kind: 'agent', agentId: AGENT }, 'issue-1', { runId: 'run-1' })).resolves.toMatchObject({ ok: true, issue: { checkout_run_id: null } })
        expect(actions(rows)).toEqual(['issue.released'])
    })
})

describe('listIssues and getIssueByRef', () => {
    it('never lists an issue of a project the actor does not see', async () => {
        const { db, scope } = setup({ issues: [issue()] })

        await expect(listIssues(scope, {}, new Set())).resolves.toEqual([])
        await expect(listIssues(scope, { projectId: 'project-1' }, new Set(['project-2']))).resolves.toEqual([])
        expect(db.chainsOn('issues')).toHaveLength(0)

        const listed = await listIssues(scope, { assignee: 'unassigned', parentIssueId: null }, new Set(['project-1']))
        expect(listed).toEqual([expect.objectContaining({ ref: 'ENG-1', assignee: null })])
    })

    it('resolves a reference with its sub-issues', async () => {
        const { scope } = setup({ issues: [issue(), issue({ id: 'child', number: 2, parent_issue_id: 'issue-1' })] })

        const detail = await getIssueByRef(scope, 'eng-1', 'all')

        expect(detail).toMatchObject({ ref: 'ENG-1', createdBy: { kind: 'user', userId: 'me' }, subIssues: [expect.objectContaining({ ref: 'ENG-2' })] })
        await expect(getIssueByRef(scope, 'ENG-1', new Set())).resolves.toBeNull()
        await expect(getIssueByRef(scope, 'nonsense', 'all')).resolves.toBeNull()
    })
})
