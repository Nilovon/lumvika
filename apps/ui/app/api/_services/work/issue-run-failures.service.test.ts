import { beforeEach, describe, expect, it, vi } from 'vitest'

import { memberActor, readAgentAccess } from '@/app/api/_auth/access'
import { resolveAgentTargetForTrigger } from '@/app/api/_services/chat.service'
import { issueRunsReadiness } from '@/app/api/_services/work/issue-runs-readiness.service'
import { EngineUnreachableError, startIssueRun } from '@/lib/engine/client'
import { workDatabase, type Row, type Tables } from '@/test/work-fake'

vi.mock('@/lib/db', async importOriginal => ({ ...(await importOriginal<object>()), ...(await import('@/test/work-fake')).workDbHelpers }))
vi.mock('@/app/api/_services/chat.service', () => ({ resolveAgentTargetForTrigger: vi.fn() }))
vi.mock('@/app/api/_services/work/issue-runs-readiness.service', () => ({ issueRunsReadiness: vi.fn() }))
vi.mock('@/app/api/_auth/access', async importOriginal => ({ ...(await importOriginal<typeof import('@/app/api/_auth/access')>()), memberActor: vi.fn(), readAgentAccess: vi.fn() }))
vi.mock('@/lib/engine/client', async importOriginal => ({ ...(await importOriginal<typeof import('@/lib/engine/client')>()), startIssueRun: vi.fn() }))
vi.mock('@/lib/chat/start-chat', () => ({ QUEUED_RETRY_DELAYS_MS: [], startChat: vi.fn() }))
vi.mock('@/lib/features', () => ({ PLATFORM_RELEASED: true }))

const { issueRunEndingOf, retryIssueRun } = await import('./issue-run-failures.service')

const WORKSPACE = 7
const conn = { baseUrl: 'https://box.test', apiKey: 'k' }

const ending = (overrides: Record<string, unknown> = {}) => ({
    event: 'agent.message.completed' as const,
    kind: 'error' as const,
    agentId: 'eng-ada',
    sessionId: 'engine-session',
    runId: 'run-1',
    source: 'issue' as const,
    message: 'Message failed: boom',
    metadata: { source: 'issue', status: 'error', issueRef: 'ENG-12', error: 'boom' } as Record<string, unknown>,
    ...overrides,
})

describe('issueRunEndingOf', () => {
    it('reads a failed issue run with the reason a channel turn would give', () => {
        expect(issueRunEndingOf(ending())).toEqual({ runId: 'run-1', engineAgentId: 'eng-ada', engineSessionId: 'engine-session', issueRef: 'ENG-12', reason: 'failed' })
        expect(issueRunEndingOf(ending({ metadata: { status: 'error', issueRef: 'ENG-12', error: 'Set OPENROUTER_API_KEY to run the Lumvika models, or connect another AI provider in the app.' } }))?.reason).toBe('no_model')
        expect(issueRunEndingOf(ending({ kind: 'done', metadata: { status: 'cancelled', issueRef: 'ENG-12' } }))?.reason).toBe('cancelled')
    })

    it('reads nothing for a run that did the work, another kind of run, or an end that names no issue', () => {
        expect(issueRunEndingOf(ending({ kind: 'done', metadata: { status: 'done', issueRef: 'ENG-12' } }))).toBeNull()
        expect(issueRunEndingOf(ending({ source: 'schedule' }))).toBeNull()
        expect(issueRunEndingOf(ending({ metadata: { status: 'error' } }))).toBeNull()
        expect(issueRunEndingOf(ending({ runId: null }))).toBeNull()
        expect(issueRunEndingOf(ending({ event: 'agent.notification' }))).toBeNull()
    })
})

function setup(issue: Row = {}, events: Row[] = [{ issue_id: 'issue-1', actor_agent_id: 'ada', action: 'issue.run_failed', metadata: { reason: 'no_model', runId: 'run-1', sessionId: 'session-row' }, created_at: '2026-11-12T10:00:00.000Z' }]) {
    const rows: Tables = {
        projects: [{ id: 'project-1', workspace_id: WORKSPACE, key: 'ENG' }],
        issues: [{ id: 'issue-1', workspace_id: WORKSPACE, project_id: 'project-1', number: 12, title: 'Write the launch post', status: 'todo', assignee_agent_id: 'ada', assignee_user_id: null, checkout_run_id: null, session_id: null, ...issue }],
        activity_events: events,
        sessions: [],
        notifications: [],
    }
    const failures = (args: Row) =>
        (args.p_issue_ids as string[]).flatMap(issueId => {
            const latest = rows.activity_events.filter(event => event.issue_id === issueId && event.actor_agent_id === rows.issues[0].assignee_agent_id).at(-1)
            return latest?.action === 'issue.run_failed' ? [{ issue_id: issueId, actor_agent_id: latest.actor_agent_id, metadata: latest.metadata, created_at: latest.created_at }] : []
        })
    const db = workDatabase(rows, { rpc: { issue_run_failures: failures } })
    return { rows, scope: { workspaceId: WORKSPACE, db: db.scope } }
}

beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(memberActor).mockResolvedValue({ kind: 'user', userId: 'anna', workspaceId: WORKSPACE, role: 'member', boxScope: 'all' } as never)
    vi.mocked(readAgentAccess).mockResolvedValue('use' as never)
    vi.mocked(issueRunsReadiness).mockResolvedValue('ready')
    vi.mocked(resolveAgentTargetForTrigger).mockResolvedValue({ engineAgentId: 'eng-ada', conn, contentLocked: false })
    vi.mocked(startIssueRun).mockResolvedValue({ started: true, runId: 'run-2', sessionId: 'engine-session-2' })
})

describe('retryIssueRun', () => {
    it('wakes the coworker on the issue for a person who may use it, and writes nothing', async () => {
        const { rows, scope } = setup()

        expect(await retryIssueRun(scope, 'anna', 'issue-1')).toEqual({ started: true })

        expect(startIssueRun).toHaveBeenCalledWith(conn, 'eng-ada', { ref: 'ENG-12', title: 'Write the launch post', reason: 'heartbeat' })
        expect(rows.activity_events).toHaveLength(1)
        expect(rows.notifications).toEqual([])
    })

    it('refuses a person the coworker is closed to, and wakes nobody', async () => {
        const { rows, scope } = setup()
        vi.mocked(readAgentAccess).mockResolvedValue('none')

        expect(await retryIssueRun(scope, 'anna', 'issue-1')).toEqual({ started: false, refusal: 'not_allowed' })
        expect(startIssueRun).not.toHaveBeenCalled()
        expect(rows.activity_events).toHaveLength(1)
    })

    it('refuses once the failure no longer shows: a newer event of the coworker, another assignee, a closed issue', async () => {
        const newer = setup({}, [
            { issue_id: 'issue-1', actor_agent_id: 'ada', action: 'issue.run_failed', metadata: { reason: 'failed', runId: 'run-1' }, created_at: '2026-11-12T10:00:00.000Z' },
            { issue_id: 'issue-1', actor_agent_id: 'ada', action: 'issue.commented', metadata: {}, created_at: '2026-11-12T10:05:00.000Z' },
        ])
        expect(await retryIssueRun(newer.scope, 'anna', 'issue-1')).toEqual({ started: false, refusal: 'not_failed' })
        expect(await retryIssueRun(setup({ assignee_agent_id: null, assignee_user_id: 'anna' }).scope, 'anna', 'issue-1')).toEqual({ started: false, refusal: 'not_failed' })
        expect(await retryIssueRun(setup({ status: 'done' }).scope, 'anna', 'issue-1')).toEqual({ started: false, refusal: 'not_failed' })
        expect(startIssueRun).not.toHaveBeenCalled()
    })

    it('says why the machine cannot run it, without trying', async () => {
        vi.mocked(issueRunsReadiness).mockResolvedValue('outdated')
        expect(await retryIssueRun(setup().scope, 'anna', 'issue-1')).toEqual({ started: false, refusal: 'outdated' })
        vi.mocked(issueRunsReadiness).mockResolvedValue('no_engine')
        expect(await retryIssueRun(setup().scope, 'anna', 'issue-1')).toEqual({ started: false, refusal: 'no_engine' })
        expect(startIssueRun).not.toHaveBeenCalled()
    })

    it('hands back the engine refusal: a coworker busy elsewhere, switched off, or a machine gone meanwhile', async () => {
        vi.mocked(startIssueRun).mockResolvedValue({ started: false, reason: 'busy', runId: 'run-9' })
        expect(await retryIssueRun(setup().scope, 'anna', 'issue-1')).toEqual({ started: false, refusal: 'busy' })
        vi.mocked(resolveAgentTargetForTrigger).mockResolvedValue(null)
        expect(await retryIssueRun(setup().scope, 'anna', 'issue-1')).toEqual({ started: false, refusal: 'disabled' })
        vi.mocked(resolveAgentTargetForTrigger).mockResolvedValue({ engineAgentId: 'eng-ada', conn, contentLocked: false })
        vi.mocked(startIssueRun).mockRejectedValue(new EngineUnreachableError('down'))
        expect(await retryIssueRun(setup().scope, 'anna', 'issue-1')).toEqual({ started: false, refusal: 'unreachable' })
    })
})
