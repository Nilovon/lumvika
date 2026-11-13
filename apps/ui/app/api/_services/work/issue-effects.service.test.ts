import type { IssueStatus, WorkAuthor } from '@lumvika/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { memberActor, readAgentAccess } from '@/app/api/_auth/access'
import { resolveAgentTargetForTrigger } from '@/app/api/_services/chat.service'
import { EngineRequestError, startIssueRun } from '@/lib/engine/client'
import { workDatabase, type Row, type Tables } from '@/test/work-fake'

const afterTasks = vi.hoisted(() => ({ inRequest: true, queued: [] as Array<() => Promise<unknown>> }))

vi.mock('@/lib/db', async importOriginal => ({ ...(await importOriginal<object>()), ...(await import('@/test/work-fake')).workDbHelpers }))
vi.mock('@/app/api/_services/chat.service', () => ({ resolveAgentTargetForTrigger: vi.fn() }))
vi.mock('@/app/api/_auth/access', async importOriginal => ({ ...(await importOriginal<typeof import('@/app/api/_auth/access')>()), memberActor: vi.fn(), readAgentAccess: vi.fn() }))
vi.mock('@/lib/engine/client', async importOriginal => ({ ...(await importOriginal<typeof import('@/lib/engine/client')>()), startIssueRun: vi.fn() }))
vi.mock('@/lib/features', () => ({ PLATFORM_RELEASED: true }))
vi.mock('next/server', () => ({
    after: (task: () => Promise<unknown>) => {
        if (!afterTasks.inRequest) throw new Error('`after` was called outside a request scope')
        afterTasks.queued.push(task)
    },
}))

const { applyIssueChange, noticeFor, reactToIssueChange, wakeFor } = await import('./issue-effects.service')
const features = (await import('@/lib/features')) as { PLATFORM_RELEASED: boolean }
type IssueChange = import('./issue-effects.service').IssueChange

const WORKSPACE = 7
const ANNA: WorkAuthor = { kind: 'user', userId: 'anna' }
const WRITER = 'agent-writer'
const BOSS = 'agent-boss'
const AS_WRITER: WorkAuthor = { kind: 'agent', agentId: WRITER }
const AS_BOSS: WorkAuthor = { kind: 'agent', agentId: BOSS }

const view = (status: IssueStatus, extra: { assignee?: string | null; checkout?: string | null } = {}) => ({ status, assignee_agent_id: extra.assignee === undefined ? WRITER : extra.assignee, checkout_run_id: extra.checkout ?? null })

function issue(overrides: Row = {}): Row {
    return {
        id: 'issue-1',
        workspace_id: WORKSPACE,
        project_id: 'project-1',
        number: 12,
        title: 'Write the launch post',
        description: null,
        status: 'todo',
        priority: 'none',
        assignee_user_id: null,
        assignee_agent_id: WRITER,
        created_by_user_id: 'anna',
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
        projects: [{ id: 'project-1', workspace_id: WORKSPACE, key: 'ENG', lead_user_id: 'lead' }],
        issues: [issue()],
        agents: [{ id: WRITER, workspace_id: WORKSPACE, name: 'Writer', space_id: 'box-1', engine_agent_id: 'engine-writer' }],
        workspace_members: [
            { user_id: 'anna', workspace_id: WORKSPACE },
            { user_id: 'lead', workspace_id: WORKSPACE },
        ],
        users: [
            { id: 'anna', email_notification_prefs: {} },
            { id: 'lead', email_notification_prefs: {} },
        ],
        sessions: [{ id: 'session-row', engine_session_id: 'engine-session' }],
        notifications: [],
        ...tables,
    }
    const db = workDatabase(rows)
    return { db, rows, scope: { workspaceId: WORKSPACE, db: db.scope } }
}

const conn = { baseUrl: 'https://box.test', apiKey: 'k' }

beforeEach(() => {
    vi.clearAllMocks()
    afterTasks.inRequest = true
    afterTasks.queued = []
    vi.mocked(resolveAgentTargetForTrigger).mockResolvedValue({ conn, engineAgentId: 'engine-writer', contentLocked: false })
    vi.mocked(startIssueRun).mockResolvedValue({ started: true, runId: 'run-1', sessionId: 'sess-1' })
    vi.mocked(memberActor).mockImplementation(async (workspaceId, userId) => ({ kind: 'user', userId, workspaceId, role: 'member', boxScope: 'all' }))
    vi.mocked(readAgentAccess).mockResolvedValue('use')
})

afterEach(() => {
    vi.restoreAllMocks()
})

describe('wakeFor', () => {
    it.each([
        ['an issue created for it in todo', { kind: 'created', issueId: 'i', author: ANNA }, view('todo'), 'assigned'],
        ['an issue assigned to it in progress', { kind: 'assigned', issueId: 'i', author: ANNA }, view('in_progress'), 'assigned'],
        ['a blocked issue handed to it by another coworker', { kind: 'assigned', issueId: 'i', author: AS_BOSS }, view('blocked'), 'assigned'],
        ['its issue leaving the backlog', { kind: 'status', issueId: 'i', from: 'backlog', author: AS_BOSS }, view('todo'), 'ready'],
        ['its issue sent back from review', { kind: 'status', issueId: 'i', from: 'in_review', author: ANNA }, view('in_progress'), 'reopened'],
        ['its issue unblocked by a person', { kind: 'status', issueId: 'i', from: 'blocked', author: ANNA }, view('todo'), 'reopened'],
        ['a person commenting on its issue in review', { kind: 'commented', issueId: 'i', body: 'Shorter please', author: ANNA }, view('in_review'), 'comment'],
    ] as const)('wakes the coworker for %s', (_label, change, issueView, reason) => {
        expect(wakeFor(change as IssueChange, issueView)).toMatchObject({ agentId: WRITER, reason })
    })

    it('hands a person comment along, cut to what the engine takes', () => {
        expect(wakeFor({ kind: 'commented', issueId: 'i', body: 'x'.repeat(5000), author: ANNA }, view('todo'))?.note).toHaveLength(2000)
    })

    it.each([
        ['an issue nobody holds as a coworker', { kind: 'created', issueId: 'i', author: ANNA }, view('todo', { assignee: null })],
        ['an issue in the backlog', { kind: 'created', issueId: 'i', author: ANNA }, view('backlog')],
        ['an issue assigned in review', { kind: 'assigned', issueId: 'i', author: ANNA }, view('in_review')],
        ['what the coworker did itself', { kind: 'status', issueId: 'i', from: 'backlog', author: AS_WRITER }, view('todo')],
        ['its own comment', { kind: 'commented', issueId: 'i', body: 'Done', author: AS_WRITER }, view('todo')],
        ['another coworker commenting', { kind: 'commented', issueId: 'i', body: 'FYI', author: AS_BOSS }, view('todo')],
        ['a comment on a closed issue', { kind: 'commented', issueId: 'i', body: 'Thanks', author: ANNA }, view('done')],
        ['an issue a run already holds', { kind: 'commented', issueId: 'i', body: 'Also this', author: ANNA }, view('in_progress', { checkout: 'run-1' })],
        ['a move between workable statuses', { kind: 'status', issueId: 'i', from: 'todo', author: ANNA }, view('in_progress')],
        ['a move to blocked by a person', { kind: 'status', issueId: 'i', from: 'todo', author: ANNA }, view('blocked')],
        ['a move to done', { kind: 'status', issueId: 'i', from: 'in_review', author: ANNA }, view('done')],
    ] as const)('never wakes it for %s', (_label, change, issueView) => {
        expect(wakeFor(change as IssueChange, issueView)).toBeNull()
    })
})

describe('noticeFor', () => {
    it('tells people when a coworker hands work back for review or is blocked', () => {
        expect(noticeFor({ kind: 'status', issueId: 'i', from: 'in_progress', author: AS_WRITER }, { status: 'in_review' })).toBe('in_review')
        expect(noticeFor({ kind: 'status', issueId: 'i', from: 'in_progress', author: AS_WRITER }, { status: 'blocked' })).toBe('blocked')
    })

    it('stays quiet for what a person did and for any other move', () => {
        expect(noticeFor({ kind: 'status', issueId: 'i', from: 'in_progress', author: ANNA }, { status: 'in_review' })).toBeNull()
        expect(noticeFor({ kind: 'status', issueId: 'i', from: 'in_review', author: AS_WRITER }, { status: 'done' })).toBeNull()
        expect(noticeFor({ kind: 'commented', issueId: 'i', body: 'x', author: AS_WRITER }, { status: 'blocked' })).toBeNull()
    })
})

describe('applyIssueChange', () => {
    it('starts an issue run on the coworker engine with the reference, the title and why', async () => {
        const { scope } = setup()
        await applyIssueChange(scope, { kind: 'commented', issueId: 'issue-1', body: 'Shorter please', author: ANNA })
        expect(resolveAgentTargetForTrigger).toHaveBeenCalledWith(WRITER)
        expect(startIssueRun).toHaveBeenCalledWith(conn, 'engine-writer', { ref: 'ENG-12', title: 'Write the launch post', reason: 'comment', note: 'Shorter please' })
    })

    it('wakes nobody on an issue whose conversation waits on a person, and wakes again once it does not', async () => {
        const { rows, scope } = setup({ issues: [issue({ session_id: 'session-row' })], sessions: [{ id: 'session-row', engine_session_id: 'engine-session', status: 'awaiting_question' }] })
        await applyIssueChange(scope, { kind: 'commented', issueId: 'issue-1', body: 'Any news?', author: ANNA })
        expect(startIssueRun).not.toHaveBeenCalled()

        rows.sessions[0].status = 'idle'
        await applyIssueChange(scope, { kind: 'commented', issueId: 'issue-1', body: 'Any news?', author: ANNA })
        expect(startIssueRun).toHaveBeenCalledTimes(1)
    })

    it('wakes nobody with the platform switched off', async () => {
        const { scope } = setup()
        features.PLATFORM_RELEASED = false
        try {
            await applyIssueChange(scope, { kind: 'assigned', issueId: 'issue-1', author: ANNA })
        } finally {
            features.PLATFORM_RELEASED = true
        }
        expect(startIssueRun).not.toHaveBeenCalled()
    })

    it('keeps quiet when the person commenting or moving the issue may not use its coworker', async () => {
        const { scope } = setup()
        vi.mocked(readAgentAccess).mockResolvedValue('none')
        await applyIssueChange(scope, { kind: 'commented', issueId: 'issue-1', body: 'Do this for me', author: ANNA })
        await applyIssueChange(scope, { kind: 'status', issueId: 'issue-1', from: 'blocked', author: ANNA })
        expect(readAgentAccess).toHaveBeenCalledWith(expect.objectContaining({ userId: 'anna' }), WRITER)
        expect(startIssueRun).not.toHaveBeenCalled()
    })

    it('keeps quiet for someone who left the workspace, and still wakes for another coworker', async () => {
        const { scope } = setup()
        vi.mocked(memberActor).mockResolvedValueOnce(null)
        await applyIssueChange(scope, { kind: 'commented', issueId: 'issue-1', body: 'Ping', author: ANNA })
        expect(startIssueRun).not.toHaveBeenCalled()

        const ready = setup({ issues: [issue({ status: 'todo' })] })
        vi.mocked(readAgentAccess).mockResolvedValue('none')
        await applyIssueChange(ready.scope, { kind: 'status', issueId: 'issue-1', from: 'backlog', author: AS_BOSS })
        expect(readAgentAccess).not.toHaveBeenCalled()
        expect(startIssueRun).toHaveBeenCalledWith(conn, 'engine-writer', expect.objectContaining({ reason: 'ready' }))
    })

    it('does nothing for an issue that is gone, or a coworker switched off', async () => {
        const { scope } = setup()
        await applyIssueChange(scope, { kind: 'created', issueId: 'missing', author: ANNA })
        vi.mocked(resolveAgentTargetForTrigger).mockResolvedValueOnce(null)
        await applyIssueChange(scope, { kind: 'created', issueId: 'issue-1', author: ANNA })
        expect(startIssueRun).not.toHaveBeenCalled()
    })

    it('tolerates an engine without issue runs, and says so once', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        vi.mocked(startIssueRun).mockRejectedValue(new EngineRequestError('404', 404))
        const { scope } = setup()
        await applyIssueChange(scope, { kind: 'created', issueId: 'issue-1', author: ANNA })
        await applyIssueChange(scope, { kind: 'created', issueId: 'issue-1', author: ANNA })
        expect(startIssueRun).toHaveBeenCalledTimes(2)
        expect(warn).toHaveBeenCalledTimes(1)
    })

    it('never throws when the engine fails', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
        vi.mocked(startIssueRun).mockRejectedValue(new Error('unreachable'))
        const { scope } = setup()
        await expect(applyIssueChange(scope, { kind: 'created', issueId: 'issue-1', author: ANNA })).resolves.toBeUndefined()
        expect(error).toHaveBeenCalledWith('[work] failed to wake the coworker', expect.objectContaining({ issue: 'ENG-12' }))
    })

    it('notifies the creator and the project lead when the coworker hands the issue back for review', async () => {
        const { rows, scope } = setup({ issues: [issue({ status: 'in_review', session_id: 'session-row' })] })

        await applyIssueChange(scope, { kind: 'status', issueId: 'issue-1', from: 'in_progress', author: AS_WRITER })

        expect(startIssueRun).not.toHaveBeenCalled()
        expect(rows.notifications).toEqual([
            expect.objectContaining({
                workspace_id: WORKSPACE,
                agent_id: WRITER,
                engine_agent_id: 'engine-writer',
                engine_session_id: 'engine-session',
                space_id: 'box-1',
                event: 'issue.in_review',
                kind: 'info',
                source: 'issue',
                message: 'Writer moved ENG-12 "Write the launch post" to review.',
                recipients: { anna: 'mine', lead: 'mine' },
                metadata: { issueId: 'issue-1', issueRef: 'ENG-12', notice: { key: 'issueInReview', values: { agentName: 'Writer', ref: 'ENG-12', title: 'Write the launch post', reason: '' } } },
            }),
        ])
    })

    it('says who must do what when the coworker is blocked, and skips whoever muted it or left', async () => {
        const { rows, scope } = setup({
            issues: [issue({ status: 'blocked', blocked_reason: 'Anna must share the key' })],
            workspace_members: [{ user_id: 'anna', workspace_id: WORKSPACE }],
            users: [{ id: 'anna', email_notification_prefs: { version: 2, coworkers: { [WRITER]: { mode: 'muted' } } } }],
        })
        await applyIssueChange(scope, { kind: 'status', issueId: 'issue-1', from: 'in_progress', author: AS_WRITER })
        expect(rows.notifications).toEqual([])

        const second = setup({ issues: [issue({ status: 'blocked', blocked_reason: 'Anna must share the key', created_by_user_id: null })] })
        await applyIssueChange(second.scope, { kind: 'status', issueId: 'issue-1', from: 'in_progress', author: AS_WRITER })
        expect(second.rows.notifications).toEqual([expect.objectContaining({ event: 'issue.blocked', message: 'Writer is blocked on ENG-12 "Write the launch post": Anna must share the key', recipients: { lead: 'mine' }, engine_session_id: null })])
    })

    it('tells nobody about an issue no person asked for nor leads', async () => {
        const { rows, scope } = setup({ projects: [{ id: 'project-1', workspace_id: WORKSPACE, key: 'ENG', lead_user_id: null }], issues: [issue({ status: 'in_review', created_by_user_id: null, created_by_agent_id: BOSS })] })
        await applyIssueChange(scope, { kind: 'status', issueId: 'issue-1', from: 'in_progress', author: AS_WRITER })
        expect(rows.notifications).toEqual([])
    })

    it('logs a notification that cannot be stored', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
        const rows: Tables = { projects: [{ id: 'project-1', workspace_id: WORKSPACE, key: 'ENG', lead_user_id: null }], issues: [issue({ status: 'in_review' })], workspace_members: [{ user_id: 'anna', workspace_id: WORKSPACE }], users: [{ id: 'anna', email_notification_prefs: {} }], agents: [] }
        const db = workDatabase(rows, { refuse: { notifications: { message: 'denied' } } })
        await applyIssueChange({ workspaceId: WORKSPACE, db: db.scope }, { kind: 'status', issueId: 'issue-1', from: 'in_progress', author: AS_WRITER })
        expect(error).toHaveBeenCalledWith('[work] failed to notify about the issue', expect.objectContaining({ issue: 'ENG-12' }))
    })
})

describe('reactToIssueChange', () => {
    it('runs after the response inside a request', async () => {
        const { scope } = setup()
        reactToIssueChange(scope, { kind: 'created', issueId: 'issue-1', author: ANNA })
        expect(startIssueRun).not.toHaveBeenCalled()
        await Promise.all(afterTasks.queued.map(task => task()))
        expect(startIssueRun).toHaveBeenCalledTimes(1)
    })

    it('runs at once outside a request, and swallows what fails', async () => {
        afterTasks.inRequest = false
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
        const { db, scope } = setup()
        vi.spyOn(db.helpers, 'selectMaybeSingle').mockRejectedValue(new Error('db down'))
        reactToIssueChange(scope, { kind: 'created', issueId: 'issue-1', author: ANNA })
        await vi.waitFor(() => expect(error).toHaveBeenCalledWith('[work] issue follow-up failed', expect.anything()))
    })
})
