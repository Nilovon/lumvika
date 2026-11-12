import { WORK_TOOL_NAMES } from '@lumvika/contracts'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthorizationError } from '@/app/api/_auth/errors'
import { workDatabase, type Row, type Tables } from '@/test/work-fake'

vi.mock('@/supabase/serviceRole', () => ({ createServiceRoleClient: vi.fn() }))
vi.mock('@/app/api/_services/chat.service', () => ({ resolveAgentTarget: vi.fn() }))
vi.mock('@/lib/engine/client', () => ({ getAgent: vi.fn() }))
vi.mock('@/app/api/_services/members.service', () => ({ resolveMemberIdentities: vi.fn() }))
vi.mock('@/app/api/_services/work/issue-effects.service', () => ({ reactToIssueChange: vi.fn() }))

const { createServiceRoleClient } = await import('@/supabase/serviceRole')
const { resolveAgentTarget } = await import('@/app/api/_services/chat.service')
const { getAgent } = await import('@/lib/engine/client')
const { resolveMemberIdentities } = await import('@/app/api/_services/members.service')
const { reactToIssueChange } = await import('@/app/api/_services/work/issue-effects.service')
const { dispatchWorkHubTool, isWorkHubTool } = await import('./work-hub.service')
const { coworkerVisibleProjectIds } = await import('@/app/api/_auth/project-access')

const WORKSPACE = 7
const ME = 'agent-writer'
const PEER = 'agent-scout'

function issue(overrides: Row = {}): Row {
    return {
        id: 'issue-1',
        workspace_id: WORKSPACE,
        project_id: 'project-1',
        number: 1,
        title: 'Write the launch post',
        description: 'Announce the release.',
        status: 'todo',
        priority: 'none',
        assignee_user_id: null,
        assignee_agent_id: ME,
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
        agents: [
            { id: ME, workspace_id: WORKSPACE, name: 'Writer', handle: 'writer' },
            { id: PEER, workspace_id: WORKSPACE, name: 'Scout', handle: 'scout' },
            { id: 'agent-far', workspace_id: 99, name: 'Far', handle: 'far' },
        ],
        projects: [
            { id: 'project-1', workspace_id: WORKSPACE, key: 'ENG', name: 'Engineering', description: null, instructions: 'Write in plain English.', status: 'active', visibility: 'workspace', team_id: null, goal_id: 'goal-1', lead_user_id: 'lead', lead_agent_id: null, monthly_budget_micros: null, target_date: null, created_by: 'anna', archived_at: null, issue_counter: 9, created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z' },
            { id: 'project-far', workspace_id: 99, key: 'FAR', name: 'Far away', archived_at: null, issue_counter: 1 },
        ],
        goals: [{ id: 'goal-1', workspace_id: WORKSPACE, title: 'Launch v2', status: 'active' }],
        workspace_members: [{ user_id: 'anna', workspace_id: WORKSPACE }],
        sessions: [{ id: 'session-row', agent_id: ME, engine_session_id: 'engine-session' }],
        issues: [],
        issue_comments: [],
        activity_events: [],
        project_members: [],
        ...tables,
    }
    const db = workDatabase(rows, {
        rpc: { project_issue_counts: () => [{ project_id: 'project-1', status: 'todo', issue_count: 1 }] },
        onInsert: {
            issues: row => {
                const project = rows.projects.find(candidate => candidate.id === row.project_id)!
                project.issue_counter = (project.issue_counter as number) + 1
                Object.assign(row, issue({ ...row, number: project.issue_counter }), { id: row.id })
            },
        },
    })
    vi.mocked(createServiceRoleClient).mockReturnValue(db.client)
    return { db, rows }
}

const call = (name: (typeof WORK_TOOL_NAMES)[number], args: Record<string, unknown> = {}) => dispatchWorkHubTool(ME, WORKSPACE, name, args)

function workSwitch(work: boolean) {
    vi.mocked(getAgent).mockResolvedValue({ config: { tools: { work } } } as never)
}

beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(resolveAgentTarget).mockResolvedValue({ conn: { baseUrl: 'https://box', apiKey: 'k' }, engineAgentId: 'engine-writer', contentLocked: false })
    vi.mocked(resolveMemberIdentities).mockResolvedValue(new Map([['anna', { name: 'Anna', email: null, avatarUrl: null }]]))
    workSwitch(true)
})

describe('isWorkHubTool', () => {
    it('knows the work family and nothing else', () => {
        for (const name of WORK_TOOL_NAMES) expect(isWorkHubTool(name)).toBe(true)
        for (const name of ['team_status', 'work', 'toString', 'constructor', 'create_issue']) expect(isWorkHubTool(name)).toBe(false)
    })
})

describe('who may call', () => {
    it('checks the switch on the calling coworker, and refuses before reading anything when it is off', async () => {
        const { db } = setup()
        workSwitch(false)
        await expect(call('work_inbox')).rejects.toThrow('switched off')
        expect(resolveAgentTarget).toHaveBeenCalledWith(ME, { kind: 'workspace', workspaceId: WORKSPACE })
        expect(getAgent).toHaveBeenCalledWith({ baseUrl: 'https://box', apiKey: 'k' }, 'engine-writer')
        expect(db.calls).toHaveLength(0)
    })

    it('refuses a coworker of another workspace', async () => {
        setup()
        vi.mocked(resolveAgentTarget).mockRejectedValue(new AuthorizationError('coworkerNotFound'))
        await expect(call('work_list_projects')).rejects.toBeInstanceOf(AuthorizationError)
    })

    it('never reaches an issue of another workspace', async () => {
        setup({ issues: [issue({ id: 'far-issue', workspace_id: 99, project_id: 'project-far' })] })
        await expect(call('work_get_issue', { ref: 'FAR-1' })).rejects.toThrow('No issue FAR-1 in this workspace.')
        await expect(call('work_comment', { ref: 'FAR-1', body: 'Hi' })).rejects.toThrow('No issue FAR-1')
        await expect(call('work_create_issue', { title: 'x', projectKey: 'FAR' })).rejects.toThrow('No project with the key FAR')
    })

    it('refuses what is not a reference', async () => {
        setup()
        await expect(call('work_get_issue', { ref: 'launch post' })).rejects.toThrow('is not an issue reference')
    })
})

describe('work_inbox', () => {
    it('lists only its own open issues, in working order, with parents and runs holding them', async () => {
        setup({
            issues: [
                issue({ id: 'parent', number: 1, status: 'in_review' }),
                issue({ id: 'low', number: 2, priority: 'low', parent_issue_id: 'parent' }),
                issue({ id: 'urgent', number: 3, priority: 'urgent' }),
                issue({ id: 'progress', number: 4, status: 'in_progress', checkout_run_id: 'run-other', checked_out_at: 'now' }),
                issue({ id: 'blocked', number: 5, status: 'blocked' }),
                issue({ id: 'due', number: 6, priority: 'low', due_date: '2026-11-13' }),
                issue({ id: 'peer', number: 7, assignee_agent_id: PEER }),
                issue({ id: 'done', number: 8, status: 'done' }),
            ],
        })

        const { issues } = (await call('work_inbox', { runId: 'run-mine' })) as { issues: Array<Record<string, unknown>> }

        expect(issues.map(row => row.ref)).toEqual(['ENG-4', 'ENG-3', 'ENG-6', 'ENG-2', 'ENG-5'])
        expect(issues[0]).toMatchObject({ status: 'in_progress', project: 'Engineering', heldByAnotherRun: true })
        expect(issues.find(row => row.ref === 'ENG-2')).toMatchObject({ parent: 'ENG-1', heldByAnotherRun: false })
    })

    it('says when nothing is open', async () => {
        setup()
        expect(await call('work_inbox')).toEqual({ issues: [], note: 'Nothing assigned to you is open.' })
    })
})

describe('work_get_issue', () => {
    it('reads the issue with its project instructions, goal, parent, sub-issues, comments and who assigned it', async () => {
        setup({
            issues: [issue({ id: 'parent', number: 1, title: 'Launch', assignee_agent_id: null }), issue({ id: 'issue-2', number: 2, parent_issue_id: 'parent' }), issue({ id: 'sub', number: 3, parent_issue_id: 'issue-2', assignee_agent_id: PEER, status: 'done' })],
            issue_comments: [
                { id: 'c1', workspace_id: WORKSPACE, issue_id: 'issue-2', author_user_id: 'anna', author_agent_id: null, body: 'Keep it short', edited_at: null, created_at: '2026-11-02T00:00:00.000Z' },
                { id: 'c2', workspace_id: WORKSPACE, issue_id: 'issue-2', author_user_id: null, author_agent_id: ME, body: 'On it', edited_at: null, created_at: '2026-11-03T00:00:00.000Z' },
            ],
            activity_events: [{ id: 'e1', workspace_id: WORKSPACE, issue_id: 'issue-2', action: 'issue.assigned', actor_user_id: 'anna', actor_agent_id: null, created_at: '2026-11-01T00:00:00.000Z' }],
        })

        const detail = await call('work_get_issue', { ref: 'eng-2' })

        expect(detail).toMatchObject({
            ref: 'ENG-2',
            description: 'Announce the release.',
            assignee: 'you',
            assignedBy: 'Anna',
            createdBy: 'Anna',
            askedByAPerson: true,
            project: { key: 'ENG', name: 'Engineering', instructions: 'Write in plain English.', lead: 'a teammate' },
            goal: { title: 'Launch v2', status: 'active' },
            parent: { ref: 'ENG-1', title: 'Launch', status: 'todo' },
            subIssues: [{ ref: 'ENG-3', status: 'done', assignee: 'Scout (@scout)' }],
            comments: [
                { author: 'Anna', body: 'Keep it short' },
                { author: 'you', body: 'On it' },
            ],
        })
    })
})

describe('work_checkout', () => {
    it('takes its own issue for this run and links the conversation it is worked in', async () => {
        const { rows } = setup({ issues: [issue()] })

        const result = await call('work_checkout', { ref: 'ENG-1', runId: 'run-1', sessionId: 'engine-session' })

        expect(result).toMatchObject({ ref: 'ENG-1', status: 'in_progress', checkedOut: true })
        expect(rows.issues[0]).toMatchObject({ checkout_run_id: 'run-1', session_id: 'session-row', status: 'in_progress' })
    })

    it('keeps the conversation link when the engine names none it knows', async () => {
        const { rows } = setup({ issues: [issue({ session_id: 'older' })] })
        await call('work_checkout', { ref: 'ENG-1', runId: 'run-1', sessionId: 'unknown' })
        expect(rows.issues[0].session_id).toBe('older')
    })

    it('says plainly that another run holds it and not to retry', async () => {
        setup({ issues: [issue({ status: 'in_progress', checkout_run_id: 'run-other', checked_out_at: 'now' })] })
        const result = (await call('work_checkout', { ref: 'ENG-1', runId: 'run-1' })) as { checkedOut: boolean; message: string }
        expect(result.checkedOut).toBe(false)
        expect(result.message).toContain('already held by another run')
        expect(result.message).toContain('Do not retry')
    })

    it('refuses an issue of someone else, one that is not workable, and a run without an id', async () => {
        setup({ issues: [issue({ assignee_agent_id: PEER }), issue({ id: 'review', number: 2, status: 'in_review' })] })
        expect(await call('work_checkout', { ref: 'ENG-1', runId: 'run-1' })).toMatchObject({ checkedOut: false, message: expect.stringContaining('not assigned to you') })
        expect(await call('work_checkout', { ref: 'ENG-2', runId: 'run-1' })).toMatchObject({ checkedOut: false, message: expect.stringContaining('cannot be taken') })
        await expect(call('work_checkout', { ref: 'ENG-1' })).rejects.toThrow('This run has no id')
    })
})

describe('work_update_status', () => {
    it('hands finished work a person asked for to review, with its comment first', async () => {
        const { rows } = setup({ issues: [issue({ status: 'in_progress' })] })

        expect(await call('work_update_status', { ref: 'ENG-1', status: 'in_review', comment: 'Draft in shared/launch.md' })).toEqual({ ref: 'ENG-1', status: 'in_review', commented: true })

        expect(rows.issue_comments).toEqual([expect.objectContaining({ author_agent_id: ME, body: 'Draft in shared/launch.md' })])
        expect(rows.activity_events.map(event => event.action)).toEqual(['issue.commented', 'issue.status_changed'])
        expect(reactToIssueChange).toHaveBeenCalledWith(expect.anything(), { kind: 'status', issueId: 'issue-1', from: 'in_progress', author: { kind: 'agent', agentId: ME } })
    })

    it('closes work a coworker created, and refuses to close or cancel what a person asked for', async () => {
        setup({ issues: [issue({ status: 'in_progress' }), issue({ id: 'mine', number: 2, status: 'in_progress', created_by_user_id: null, created_by_agent_id: PEER })] })
        await expect(call('work_update_status', { ref: 'ENG-1', status: 'done' })).rejects.toThrow('move it to in_review')
        await expect(call('work_update_status', { ref: 'ENG-1', status: 'cancelled' })).rejects.toThrow('who alone can cancel it')
        expect(await call('work_update_status', { ref: 'ENG-2', status: 'done' })).toEqual({ ref: 'ENG-2', status: 'done' })
    })

    it('needs who must do what to block, and lets go of the run that blocked', async () => {
        const { rows } = setup({ issues: [issue({ status: 'in_progress', checkout_run_id: 'run-1', checked_out_at: 'now' })] })
        await expect(call('work_update_status', { ref: 'ENG-1', status: 'blocked', blockedReason: '  ' })).rejects.toThrow('Say who must do what')

        await call('work_update_status', { ref: 'ENG-1', status: 'blocked', blockedReason: 'Anna must share the Stripe key', runId: 'run-1' })

        expect(rows.issues[0]).toMatchObject({ status: 'blocked', blocked_reason: 'Anna must share the Stripe key', checkout_run_id: null })
    })

    it('only moves its own issues, and only along the board', async () => {
        setup({ issues: [issue({ assignee_agent_id: PEER }), issue({ id: 'two', number: 2, status: 'done', created_by_user_id: null })] })
        await expect(call('work_update_status', { ref: 'ENG-1', status: 'in_progress' })).rejects.toThrow('not assigned to you')
        setup({ issues: [issue({ status: 'todo' })] })
        await expect(call('work_update_status', { ref: 'ENG-1', status: 'in_review' })).rejects.toThrow('cannot go from todo to in_review. From todo it can go to: in_progress, backlog, blocked, cancelled.')
        await expect(call('work_update_status', { ref: 'ENG-1', status: 'backlog' })).rejects.toThrow('A coworker moves an issue to one of')
    })

    it('treats the status it already has as done', async () => {
        const { db } = setup({ issues: [issue({ status: 'in_progress' })] })
        expect(await call('work_update_status', { ref: 'ENG-1', status: 'in_progress' })).toEqual({ ref: 'ENG-1', status: 'in_progress' })
        expect(db.writes('issues')).toHaveLength(0)
    })
})

describe('work_comment', () => {
    it('comments on any issue of the workspace, signed by the coworker', async () => {
        const { rows } = setup({ issues: [issue({ assignee_agent_id: PEER })] })
        expect(await call('work_comment', { ref: 'ENG-1', body: 'The numbers are in the brief.' })).toEqual({ ref: 'ENG-1', commentId: expect.any(String) })
        expect(rows.issue_comments[0]).toMatchObject({ author_agent_id: ME, author_user_id: null })
        expect(reactToIssueChange).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ kind: 'commented', author: { kind: 'agent', agentId: ME } }))
    })
})

describe('work_create_issue', () => {
    it('delegates a sub-issue to another coworker by handle, ready to work', async () => {
        const { rows } = setup({ issues: [issue()] })

        const created = await call('work_create_issue', { title: 'Collect the numbers', parentRef: 'ENG-1', assignee: '@Scout', priority: 'high' })

        expect(created).toMatchObject({ ref: 'ENG-10', status: 'todo', message: expect.stringContaining('woken') })
        expect(rows.issues[1]).toMatchObject({ project_id: 'project-1', parent_issue_id: 'issue-1', assignee_agent_id: PEER, created_by_agent_id: ME, priority: 'high', status: 'todo' })
        expect(reactToIssueChange).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ kind: 'created', author: { kind: 'agent', agentId: ME } }))
    })

    it('files work for itself or for nobody', async () => {
        const { rows } = setup()
        expect(await call('work_create_issue', { title: 'Follow up', projectKey: 'eng', assignee: 'me' })).toEqual({ ref: 'ENG-10', status: 'todo' })
        expect(await call('work_create_issue', { title: 'Someday', projectKey: 'ENG' })).toEqual({ ref: 'ENG-11', status: 'backlog' })
        expect(await call('work_create_issue', { title: 'Later', projectKey: 'ENG', assignee: 'writer', status: 'backlog' })).toEqual({ ref: 'ENG-12', status: 'backlog' })
        expect(rows.issues.map(row => row.assignee_agent_id)).toEqual([ME, null, ME])
    })

    it('refuses what it cannot place or assign', async () => {
        setup()
        await expect(call('work_create_issue', { title: '  ' })).rejects.toThrow('Give the issue a title')
        await expect(call('work_create_issue', { title: 'x' })).rejects.toThrow('Name the project')
        await expect(call('work_create_issue', { title: 'x', projectKey: 'ENG', assignee: '@far' })).rejects.toThrow('No coworker goes by "@far"')
        await expect(call('work_create_issue', { title: 'x', projectKey: 'ENG', priority: 'asap' })).rejects.toThrow('priority is one of')
    })
})

describe('work_list_issues', () => {
    it('filters by project, status, assignee and text, newest first', async () => {
        setup({
            issues: [
                issue({ id: 'a', number: 1, updated_at: '2026-11-01T00:00:00.000Z' }),
                issue({ id: 'b', number: 2, assignee_agent_id: PEER, title: 'Collect numbers', updated_at: '2026-11-03T00:00:00.000Z' }),
                issue({ id: 'c', number: 3, assignee_agent_id: null, status: 'backlog', updated_at: '2026-11-02T00:00:00.000Z' }),
            ],
        })
        const refs = async (args: Record<string, unknown>) => ((await call('work_list_issues', args)) as { issues: Array<{ ref: string }> }).issues.map(row => row.ref)

        expect(await refs({ projectKey: 'ENG' })).toEqual(['ENG-2', 'ENG-3', 'ENG-1'])
        expect(await refs({ assignee: 'me' })).toEqual(['ENG-1'])
        expect(await refs({ assignee: 'scout' })).toEqual(['ENG-2'])
        expect(await refs({ assignee: 'unassigned' })).toEqual(['ENG-3'])
        expect(await refs({ status: ['backlog'] })).toEqual(['ENG-3'])
        expect(await call('work_list_issues', { limit: 1 })).toMatchObject({ issues: [{ ref: 'ENG-2', assignee: 'Scout (@scout)' }], note: expect.stringContaining('Showing the 1 most recently updated') })
        await expect(call('work_list_issues', { status: ['soon'] })).rejects.toThrow('status is a list of')
    })
})

describe('work_list_projects', () => {
    it('lists the projects the coworker sees', async () => {
        setup()
        expect(await call('work_list_projects')).toEqual({ projects: [{ key: 'ENG', name: 'Engineering', description: null, status: 'active', lead: 'a teammate', targetDate: null, issueCounts: { todo: 1 } }] })
    })
})

describe('what a coworker sees of restricted projects', () => {
    const secret = (extra: Row = {}): Row => ({ id: 'project-r', workspace_id: WORKSPACE, key: 'SEC', name: 'Secret', description: null, instructions: null, status: 'active', visibility: 'restricted', team_id: null, goal_id: null, lead_user_id: null, lead_agent_id: null, monthly_budget_micros: null, target_date: null, created_by: 'anna', archived_at: null, issue_counter: 9, created_at: '2026-10-02T00:00:00.000Z', updated_at: '2026-10-02T00:00:00.000Z', ...extra })
    const secretIssue = (extra: Row = {}): Row => issue({ id: 'secret-1', project_id: 'project-r', number: 1, title: 'Acquisition memo', assignee_agent_id: 'agent-other', ...extra })

    function withSecret(project: Row = {}, issues: Row[] = [secretIssue()]) {
        const { rows } = setup({ issues: [issue(), ...issues] })
        rows.projects.push(secret(project))
        rows.agents.push({ id: 'agent-other', workspace_id: WORKSPACE, name: 'Other', handle: 'other' })
        return rows
    }

    it('answers a restricted project it is not involved in exactly like a missing one, in every tool', async () => {
        withSecret()
        const missing = (await call('work_get_issue', { ref: 'SEC-9' }).catch((err: Error) => err.message)) as string
        expect(await call('work_get_issue', { ref: 'SEC-1' }).catch((err: Error) => err.message)).toBe(missing.replace('SEC-9', 'SEC-1'))
        await expect(call('work_comment', { ref: 'SEC-1', body: 'Hi' })).rejects.toThrow('No issue SEC-1 in this workspace.')
        await expect(call('work_checkout', { ref: 'SEC-1', runId: 'run-1' })).rejects.toThrow('No issue SEC-1 in this workspace.')
        await expect(call('work_update_status', { ref: 'SEC-1', status: 'in_progress' })).rejects.toThrow('No issue SEC-1 in this workspace.')
        await expect(call('work_create_issue', { title: 'x', parentRef: 'SEC-1' })).rejects.toThrow('No issue SEC-1 in this workspace.')
        await expect(call('work_create_issue', { title: 'x', projectKey: 'SEC' })).rejects.toThrow('No project with the key SEC.')
        await expect(call('work_list_issues', { projectKey: 'SEC' })).rejects.toThrow('No project with the key SEC.')
        await expect(call('work_list_issues', { projectKey: 'ZZZ' })).rejects.toThrow('No project with the key ZZZ.')
        expect(((await call('work_list_issues', {})) as { issues: Array<{ ref: string }> }).issues.map(row => row.ref)).toEqual(['ENG-1'])
        expect(((await call('work_list_projects')) as { projects: Array<{ key: string }> }).projects.map(row => row.key)).toEqual(['ENG'])
    })

    it.each([
        ['it leads the project', { lead_agent_id: ME }, [secretIssue()]],
        ['it is assignee of one of its issues', {}, [secretIssue(), secretIssue({ id: 'secret-2', number: 2, assignee_agent_id: ME })]],
        ['it created one of its issues', {}, [secretIssue(), secretIssue({ id: 'secret-2', number: 2, assignee_agent_id: null, created_by_user_id: null, created_by_agent_id: ME })]],
    ] as const)('sees the whole restricted project when %s', async (_label, project, issues) => {
        withSecret(project, [...issues])
        expect(await coworkerVisibleProjectIds(WORKSPACE, ME)).toEqual(new Set(['project-1', 'project-r']))
        expect(await call('work_get_issue', { ref: 'SEC-1' })).toMatchObject({ ref: 'SEC-1', title: 'Acquisition memo' })
        expect(((await call('work_list_projects')) as { projects: Array<{ key: string }> }).projects.map(row => row.key)).toEqual(['ENG', 'SEC'])
        expect(await call('work_comment', { ref: 'SEC-1', body: 'Numbers attached.' })).toMatchObject({ ref: 'SEC-1' })
    })

    it('delegates inside a restricted project it is involved in, which involves the coworker it assigns', async () => {
        const rows = withSecret({ lead_agent_id: ME })
        expect(await call('work_create_issue', { title: 'Check the figures', parentRef: 'SEC-1', assignee: '@scout' })).toMatchObject({ ref: 'SEC-10', status: 'todo' })
        expect(rows.issues.at(-1)).toMatchObject({ project_id: 'project-r', assignee_agent_id: PEER })
        expect(await coworkerVisibleProjectIds(WORKSPACE, PEER)).toEqual(new Set(['project-1', 'project-r']))
        expect(await coworkerVisibleProjectIds(WORKSPACE, 'agent-nobody')).toEqual(new Set(['project-1']))
    })

    it('leaves a project open to the workspace visible to every coworker', async () => {
        setup()
        expect(await coworkerVisibleProjectIds(WORKSPACE, 'agent-nobody')).toEqual(new Set(['project-1']))
    })
})
