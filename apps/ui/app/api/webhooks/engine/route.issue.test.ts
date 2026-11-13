import { beforeEach, describe, expect, it, vi } from 'vitest'

import { workDatabase, type Row, type Tables } from '@/test/work-fake'

// A coworker's run on an issue that ends without the work is written on the issue by the run-end
// webhook, as the coworker: once per run however often the engine reports it, whether or not the run
// had taken the issue, and the people who asked for the issue hear it once.

const afterTasks = vi.hoisted(() => ({ queued: [] as Array<() => Promise<unknown>> }))

vi.mock('@/lib/db', async importOriginal => ({ ...(await importOriginal<object>()), ...(await import('@/test/work-fake')).workDbHelpers }))
vi.mock('@/app/api/_services/workspace-engine.service', () => ({ authenticateEngineToken: vi.fn(), findWorkspaceEngine: vi.fn() }))
vi.mock('@/app/api/_services/notification.service', () => ({ recordNotification: vi.fn() }))
vi.mock('@/app/api/_services/getting-started.service', () => ({ recordGettingStartedEvent: vi.fn() }))
vi.mock('@/app/api/_services/notification-audience.service', () => ({ followAuthorOfCreatedTask: vi.fn() }))
vi.mock('@/app/api/_services/members.service', () => ({ resolveMemberIdentities: vi.fn().mockResolvedValue(new Map()) }))
vi.mock('@/app/api/_services/chat.service', () => ({ ensureSessionRow: vi.fn(), resolveAgentTargetForTrigger: vi.fn() }))
vi.mock('@/lib/chat/start-chat', () => ({ QUEUED_RETRY_DELAYS_MS: [], startChat: vi.fn() }))
vi.mock('@/lib/features', () => ({ PLATFORM_RELEASED: true }))
vi.mock('next/server', async importOriginal => ({ ...(await importOriginal<typeof import('next/server')>()), after: (task: () => Promise<unknown>) => void afterTasks.queued.push(task) }))

const { authenticateEngineToken } = await import('@/app/api/_services/workspace-engine.service')
const { recordNotification } = await import('@/app/api/_services/notification.service')
const { POST } = await import('./route')

const WORKSPACE = 7
const KEY = 'engine-key-of-workspace-7'
const NO_MODEL = 'Set OPENROUTER_API_KEY to run the Lumvika models, or connect another AI provider in the app.'

// `issue_run_failures` as the migration computes it: the assignee's latest event, when it is a failure.
function issueRunFailures(rows: Tables) {
    return (args: Row) =>
        (args.p_issue_ids as string[]).flatMap(issueId => {
            const issue = rows.issues.find(row => row.id === issueId)
            const own = rows.activity_events.filter(event => event.issue_id === issueId && event.actor_agent_id && event.actor_agent_id === issue?.assignee_agent_id)
            const latest = own.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0]
            return latest?.action === 'issue.run_failed' ? [{ issue_id: issueId, actor_agent_id: latest.actor_agent_id, metadata: latest.metadata, created_at: latest.created_at }] : []
        })
}

function setup(issue: Row = {}): Tables {
    const rows: Tables = {
        projects: [{ id: 'project-1', workspace_id: WORKSPACE, key: 'ENG', lead_user_id: 'lead', archived_at: null }],
        issues: [
            {
                id: 'issue-1',
                workspace_id: WORKSPACE,
                project_id: 'project-1',
                number: 12,
                title: 'Write the launch post',
                status: 'todo',
                assignee_agent_id: 'ada',
                assignee_user_id: null,
                created_by_user_id: 'anna',
                created_by_agent_id: null,
                checkout_run_id: null,
                checked_out_at: null,
                session_id: null,
                blocked_reason: null,
                ...issue,
            },
        ],
        activity_events: [],
        issue_comments: [],
        agents: [{ id: 'ada', workspace_id: WORKSPACE, name: 'Ada', space_id: 'box-1', engine_agent_id: 'eng-ada', disabled_at: null }],
        sessions: [{ id: 'session-row', agent_id: 'ada', engine_session_id: 'engine-session' }],
        workspace_members: [
            { user_id: 'anna', workspace_id: WORKSPACE },
            { user_id: 'lead', workspace_id: WORKSPACE },
        ],
        users: [
            { id: 'anna', email_notification_prefs: {} },
            { id: 'lead', email_notification_prefs: {} },
        ],
        notifications: [],
    }
    const unique = { activity_events: (row: Row, existing: Row) => row.action === 'issue.run_failed' && existing.action === 'issue.run_failed' && (row.metadata as Row).runId === (existing.metadata as Row).runId }
    workDatabase(rows, { rpc: { issue_run_failures: issueRunFailures(rows) }, unique })
    return rows
}

function runEnded(overrides: Row = {}) {
    const body = {
        event: 'agent.message.completed',
        kind: 'error',
        agentId: 'eng-ada',
        sessionId: 'engine-session',
        runId: 'run-1',
        source: 'issue',
        message: `Message failed: ${NO_MODEL}`,
        timestamp: '2026-11-12T10:01:00.000Z',
        metadata: { source: 'issue', status: 'error', issueRef: 'ENG-12', error: NO_MODEL },
        ...overrides,
    }
    return new Request('https://lumvika.test/api/webhooks/engine', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` }, body: JSON.stringify(body) })
}

async function deliver(request: Request) {
    const response = await POST(request)
    while (afterTasks.queued.length > 0) await afterTasks.queued.shift()?.()
    return response
}

const failuresOf = (rows: Tables) => rows.activity_events.filter(event => event.action === 'issue.run_failed')

beforeEach(() => {
    vi.clearAllMocks()
    afterTasks.queued = []
    vi.mocked(authenticateEngineToken).mockImplementation(async token => (token === KEY ? { workspaceId: WORKSPACE, isSandbox: false } : null))
    vi.mocked(recordNotification).mockResolvedValue({ ok: true } as never)
})

describe('POST /api/webhooks/engine for a coworker run on an issue', () => {
    it('records a run that died before it took the issue once, as the coworker, however often the engine reports it', async () => {
        const rows = setup()

        expect((await deliver(runEnded())).status).toBe(202)
        expect((await deliver(runEnded())).status).toBe(202)

        expect(failuresOf(rows)).toEqual([
            expect.objectContaining({ issue_id: 'issue-1', project_id: 'project-1', actor_agent_id: 'ada', actor_user_id: null, metadata: expect.objectContaining({ reason: 'no_model', sessionId: 'session-row', runId: 'run-1' }) }),
        ])
        expect(rows.notifications).toHaveLength(1)
        expect(rows.notifications[0]).toMatchObject({ event: 'issue.run_failed', agent_id: 'ada', engine_session_id: 'engine-session', recipients: { anna: 'mine', lead: 'mine' }, metadata: { issueRef: 'ENG-12', notice: { key: 'issueRunFailed', values: { agentName: 'Ada', ref: 'ENG-12', reason: 'no_model' } } } })
    })

    it('lets go of an issue the run had taken, then records the failure after the release', async () => {
        const rows = setup({ status: 'in_progress', checkout_run_id: 'run-1', checked_out_at: '2026-11-12T10:00:00.000Z', session_id: 'session-row' })

        await deliver(runEnded({ kind: 'error', message: 'Message failed: boom', metadata: { source: 'issue', status: 'error', issueRef: 'ENG-12', error: 'boom' } }))

        expect(rows.issues[0]).toMatchObject({ checkout_run_id: null, status: 'in_progress' })
        expect(rows.activity_events.map(event => event.action)).toEqual(['issue.released', 'issue.run_failed'])
        expect(failuresOf(rows)[0].metadata).toMatchObject({ reason: 'failed', runId: 'run-1' })
    })

    it('records a run someone stopped as cancelled', async () => {
        const rows = setup()
        await deliver(runEnded({ kind: 'done', message: 'Message stopped', metadata: { source: 'issue', status: 'cancelled', issueRef: 'ENG-12' } }))
        expect(failuresOf(rows)[0].metadata).toMatchObject({ reason: 'cancelled' })
    })

    it('records nothing for a run that did the work, nor for an issue no longer assigned to that coworker', async () => {
        const done = setup()
        await deliver(runEnded({ kind: 'done', message: 'Done', metadata: { source: 'issue', status: 'done', issueRef: 'ENG-12' } }))
        expect(failuresOf(done)).toEqual([])

        const reassigned = setup({ assignee_agent_id: 'someone-else' })
        await deliver(runEnded())
        expect(failuresOf(reassigned)).toEqual([])
    })

    it('tells people once while the coworker keeps failing on the same issue', async () => {
        const rows = setup()
        await deliver(runEnded({ runId: 'run-1' }))
        await deliver(runEnded({ runId: 'run-2' }))

        expect(failuresOf(rows)).toHaveLength(2)
        expect(rows.notifications).toHaveLength(1)
    })
})
