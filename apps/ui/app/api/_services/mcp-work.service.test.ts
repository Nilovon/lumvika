import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Actor } from '@/app/api/_auth/access'
import { ACCOUNT_TOOL_NAMES } from '@/lib/mcp/account-tools'
import { assertImportCall, importToolDefs } from '@/lib/mcp/import-scope'
import { WORK_ACCOUNT_TOOL_DEFS } from '@/lib/mcp/work-tools'
import { workDatabase, type Row, type Tables } from '@/test/work-fake'

vi.mock('@/lib/db', async importOriginal => ({ ...(await importOriginal<object>()), ...(await import('@/test/work-fake')).workDbHelpers }))
vi.mock('@/app/api/_services/work/issue-effects.service', () => ({ reactToIssueChange: vi.fn() }))
vi.mock('@/app/api/_auth/access', async importOriginal => ({ ...(await importOriginal<typeof import('@/app/api/_auth/access')>()), visibleAgentIds: vi.fn() }))

const { visibleAgentIds } = await import('@/app/api/_auth/access')
const { reactToIssueChange } = await import('@/app/api/_services/work/issue-effects.service')
const { dispatchWorkAccountTool, isWorkAccountTool } = await import('./mcp-work.service')

const WORKSPACE = 7
const member: Actor = { kind: 'user', userId: 'anna', workspaceId: WORKSPACE, role: 'member', boxScope: 'all' }
const workspace: Actor = { kind: 'workspace', workspaceId: WORKSPACE }

function issue(overrides: Row = {}): Row {
    return {
        id: 'issue-1',
        workspace_id: WORKSPACE,
        project_id: 'open',
        number: 1,
        title: 'Write the launch post',
        description: null,
        status: 'todo',
        priority: 'none',
        assignee_user_id: null,
        assignee_agent_id: null,
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

const project = (id: string, key: string, visibility: string, extra: Row = {}): Row => ({ id, workspace_id: WORKSPACE, key, name: `${key} project`, description: null, instructions: null, status: 'active', visibility, team_id: null, goal_id: null, lead_user_id: null, lead_agent_id: null, monthly_budget_micros: null, target_date: null, created_by: 'anna', archived_at: null, issue_counter: 5, created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z', ...extra })

function setup(tables: Partial<Tables> = {}) {
    const rows: Tables = {
        projects: [project('open', 'ENG', 'workspace'), project('secret', 'SEC', 'restricted')],
        project_members: [],
        workspace_members: [{ user_id: 'anna', workspace_id: WORKSPACE, role: 'member', box_scope: 'all' }],
        agents: [{ id: 'agent-writer', workspace_id: WORKSPACE }],
        issues: [issue(), issue({ id: 'secret-1', project_id: 'secret', number: 1 })],
        issue_comments: [{ id: 'c1', workspace_id: WORKSPACE, issue_id: 'issue-1', author_user_id: 'anna', author_agent_id: null, body: 'Keep it short', edited_at: null, created_at: '2026-11-02T00:00:00.000Z' }],
        activity_events: [],
        ...tables,
    }
    const db = workDatabase(rows, {
        rpc: { project_issue_counts: () => [] },
        onInsert: {
            issues: row => {
                const owner = rows.projects.find(candidate => candidate.id === row.project_id)!
                owner.issue_counter = (owner.issue_counter as number) + 1
                Object.assign(row, issue({ ...row, number: owner.issue_counter }), { id: row.id })
            },
        },
    })
    return { db, rows }
}

beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(visibleAgentIds).mockResolvedValue('all')
})

describe('the projects half of the account server', () => {
    it('advertises the six tools and answers each of them', () => {
        expect(WORK_ACCOUNT_TOOL_DEFS.map(def => def.name)).toEqual(['list_projects', 'list_issues', 'get_issue', 'create_issue', 'update_issue', 'comment_issue'])
        for (const def of WORK_ACCOUNT_TOOL_DEFS) {
            expect(isWorkAccountTool(def.name)).toBe(true)
            expect(ACCOUNT_TOOL_NAMES).toContain(def.name)
        }
        expect(isWorkAccountTool('list_agents')).toBe(false)
    })

    it('stays out of reach of an import key', () => {
        expect(importToolDefs(WORK_ACCOUNT_TOOL_DEFS)).toEqual([])
        for (const def of WORK_ACCOUNT_TOOL_DEFS) expect(() => assertImportCall({ boundAgentId: 'agent-1' }, def.name, {})).toThrow('not available to an import key')
    })

    it('refuses a name it does not know', async () => {
        setup()
        await expect(dispatchWorkAccountTool(member, 'drop_issue', {})).rejects.toThrow('Unknown tool: drop_issue')
    })
})

describe('reads, with the access of the key creator', () => {
    it('lists the projects the member sees, and every project for a workspace key', async () => {
        setup()
        const keys = async (actor: Actor) => ((await dispatchWorkAccountTool(actor, 'list_projects', {})) as { projects: Array<{ key: string }> }).projects.map(row => row.key)
        expect(await keys(member)).toEqual(['ENG'])
        expect(await keys(workspace)).toEqual(['ENG', 'SEC'])
    })

    it('lists and reads only issues of visible projects', async () => {
        setup()
        expect(await dispatchWorkAccountTool(member, 'list_issues', {})).toMatchObject({ issues: [{ ref: 'ENG-1' }] })
        expect(await dispatchWorkAccountTool(member, 'list_issues', { assignee: 'unassigned', status: ['todo'], limit: 500 })).toMatchObject({ issues: [{ ref: 'ENG-1' }] })
        await expect(dispatchWorkAccountTool(member, 'list_issues', { projectKey: 'SEC' })).rejects.toMatchObject({ code: 'projectNotFound' })
        await expect(dispatchWorkAccountTool(member, 'get_issue', { ref: 'SEC-1' })).rejects.toThrow('No issue SEC-1 on this account.')

        const detail = await dispatchWorkAccountTool(member, 'get_issue', { ref: 'eng-1' })
        expect(detail).toMatchObject({ ref: 'ENG-1', beingWorkedOn: false, comments: [{ author: { kind: 'user', userId: 'anna' }, body: 'Keep it short' }] })
    })

    it('filters by an assigned coworker or member, and by parent', async () => {
        setup({ issues: [issue({ assignee_agent_id: 'agent-writer' }), issue({ id: 'two', number: 2, assignee_user_id: 'anna', parent_issue_id: 'issue-1' })] })
        const refs = async (args: Record<string, unknown>) => ((await dispatchWorkAccountTool(workspace, 'list_issues', args)) as { issues: Array<{ ref: string }> }).issues.map(row => row.ref)
        expect(await refs({ assignee: 'agent-writer' })).toEqual(['ENG-1'])
        expect(await refs({ assignee: 'anna' })).toEqual(['ENG-2'])
        expect(await refs({ parentRef: 'ENG-1', projectKey: 'ENG' })).toEqual(['ENG-2'])
    })
})

describe('writes', () => {
    it('creates an issue signed by the member, assigned to a coworker, which sets off the wake', async () => {
        const { rows } = setup()
        const created = await dispatchWorkAccountTool(member, 'create_issue', { projectKey: 'ENG', title: 'Write the FAQ', status: 'todo', priority: 'high', assignee: { kind: 'agent', agentId: 'agent-writer' } })
        expect(created).toMatchObject({ ref: 'ENG-6', status: 'todo' })
        expect(rows.issues.at(-1)).toMatchObject({ created_by_user_id: 'anna', assignee_agent_id: 'agent-writer', priority: 'high' })
        expect(reactToIssueChange).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ kind: 'created', author: { kind: 'user', userId: 'anna' } }))
    })

    it('creates a sub-issue in its parent project, signed by nobody for a workspace key', async () => {
        const { rows } = setup()
        await dispatchWorkAccountTool(workspace, 'create_issue', { parentRef: 'ENG-1', title: 'Draft' })
        expect(rows.issues.at(-1)).toMatchObject({ project_id: 'open', parent_issue_id: 'issue-1', created_by_user_id: null, status: 'backlog' })
    })

    it('refuses a project the member cannot see, a missing project and a coworker it cannot see', async () => {
        setup()
        await expect(dispatchWorkAccountTool(member, 'create_issue', { projectKey: 'SEC', title: 'x' })).rejects.toMatchObject({ code: 'projectNotFound' })
        await expect(dispatchWorkAccountTool(member, 'create_issue', { title: 'x' })).rejects.toThrow('Pass projectKey')
        vi.mocked(visibleAgentIds).mockResolvedValue(new Set())
        await expect(dispatchWorkAccountTool(member, 'create_issue', { projectKey: 'ENG', title: 'x', assignee: { kind: 'agent', agentId: 'agent-writer' } })).rejects.toThrow('No coworker agent-writer')
        await expect(dispatchWorkAccountTool(member, 'create_issue', { projectKey: 'ENG', title: 'x', assignee: { kind: 'robot' } })).rejects.toThrow('assignee is')
    })

    it('updates fields, assignee and status, the status along the board', async () => {
        const { rows } = setup()
        const result = await dispatchWorkAccountTool(member, 'update_issue', { ref: 'ENG-1', title: 'Write the launch post, short', assignee: { kind: 'agent', agentId: 'agent-writer' }, status: 'in_progress' })
        expect(result).toMatchObject({ ref: 'ENG-1', status: 'in_progress', title: 'Write the launch post, short', assignee: { kind: 'agent', agentId: 'agent-writer' } })
        expect(rows.activity_events.map(event => event.action)).toEqual(['issue.updated', 'issue.assigned', 'issue.status_changed'])

        await expect(dispatchWorkAccountTool(member, 'update_issue', { ref: 'ENG-1', status: 'backlog' })).rejects.toMatchObject({ code: 'issueTransitionNotAllowed' })
        await dispatchWorkAccountTool(member, 'update_issue', { ref: 'ENG-1', status: 'blocked', blockedReason: 'Waiting on legal' })
        expect(rows.issues[0]).toMatchObject({ status: 'blocked', blocked_reason: 'Waiting on legal' })
        await dispatchWorkAccountTool(member, 'update_issue', { ref: 'ENG-1', blockedReason: 'Waiting on Anna', assignee: null })
        expect(rows.issues[0]).toMatchObject({ blocked_reason: 'Waiting on Anna', assignee_agent_id: null })
    })

    it('comments as the member, and never on an issue it cannot see', async () => {
        const { rows } = setup()
        expect(await dispatchWorkAccountTool(member, 'comment_issue', { ref: 'ENG-1', body: 'Ship it' })).toEqual({ ref: 'ENG-1', commentId: expect.any(String) })
        expect(rows.issue_comments.at(-1)).toMatchObject({ author_user_id: 'anna', body: 'Ship it' })
        await expect(dispatchWorkAccountTool(member, 'comment_issue', { ref: 'SEC-1', body: 'Hi' })).rejects.toThrow('No issue SEC-1')
    })
})
