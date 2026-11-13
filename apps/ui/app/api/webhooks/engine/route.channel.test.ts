import { beforeEach, describe, expect, it, vi } from 'vitest'

import { workDatabase, type Row, type Tables } from '@/test/work-fake'

// A coworker summoned in a channel answers through the engine's run-end webhook: the route reads the
// ending off the payload, closes the coworker's turn and posts what it said in the thread. Whether the
// route does that before or after it answers the engine, the channel reads the same once it is done.

const afterTasks = vi.hoisted(() => ({ queued: [] as Array<() => Promise<unknown>> }))

vi.mock('@/supabase/serviceRole', () => ({ createServiceRoleClient: vi.fn() }))
vi.mock('@/app/api/_services/workspace-engine.service', () => ({ authenticateEngineToken: vi.fn(), findWorkspaceEngine: vi.fn() }))
vi.mock('@/app/api/_services/notification.service', () => ({ recordNotification: vi.fn() }))
vi.mock('@/app/api/_services/getting-started.service', () => ({ recordGettingStartedEvent: vi.fn() }))
vi.mock('@/app/api/_services/notification-audience.service', () => ({ followAuthorOfCreatedTask: vi.fn() }))
vi.mock('@/app/api/_services/work/work-queue.service', () => ({ releaseRunCheckouts: vi.fn().mockResolvedValue(0) }))
vi.mock('@/app/api/_services/members.service', () => ({ resolveMemberIdentities: vi.fn().mockResolvedValue(new Map()) }))
vi.mock('@/app/api/_services/chat.service', () => ({ ensureSessionRow: vi.fn() }))
vi.mock('@/lib/chat/start-chat', () => ({ QUEUED_RETRY_DELAYS_MS: [], startChat: vi.fn() }))
vi.mock('@/lib/engine/client', async importOriginal => ({ ...(await importOriginal<typeof import('@/lib/engine/client')>()), getRun: vi.fn() }))
vi.mock('next/server', async importOriginal => ({ ...(await importOriginal<typeof import('next/server')>()), after: (task: () => Promise<unknown>) => void afterTasks.queued.push(task) }))

const { createServiceRoleClient } = await import('@/supabase/serviceRole')
const { authenticateEngineToken, findWorkspaceEngine } = await import('@/app/api/_services/workspace-engine.service')
const { recordNotification } = await import('@/app/api/_services/notification.service')
const { getRun } = await import('@/lib/engine/client')
const { POST } = await import('./route')

const WORKSPACE = 7
const KEY = 'engine-key-of-workspace-7'
const CONN = { baseUrl: 'http://engine', apiKey: KEY }

function setup(): Tables {
    const rows: Tables = {
        channels: [{ id: 'pub', workspace_id: WORKSPACE, name: 'launch', description: null, kind: 'public', project_id: null, team_id: null, created_by: 'anna', archived_at: null, created_at: 'then', updated_at: 'then' }],
        channel_members: [
            { id: 'm-anna', channel_id: 'pub', workspace_id: WORKSPACE, user_id: 'anna', agent_id: null, last_read_at: null, created_at: 'then', updated_at: 'then' },
            { id: 'm-ada', channel_id: 'pub', workspace_id: WORKSPACE, user_id: null, agent_id: 'ada', last_read_at: null, created_at: 'then', updated_at: 'then' },
        ],
        channel_messages: [
            { id: 'ask', channel_id: 'pub', workspace_id: WORKSPACE, author_user_id: 'anna', author_agent_id: null, body: '@ada three taglines please', parent_message_id: null, mentions: [{ kind: 'agent', agentId: 'ada' }], edited_at: null, deleted_at: null, created_at: '2026-11-12T10:00:00.000Z', updated_at: '2026-11-12T10:00:00.000Z' },
        ],
        channel_agent_turns: [
            { id: 'turn-1', workspace_id: WORKSPACE, channel_id: 'pub', agent_id: 'ada', thread_message_id: 'ask', trigger_message_id: 'ask', requested_by: 'anna', status: 'answering', failure: null, reply_message_id: null, engine_run_id: 'run-1', created_at: new Date().toISOString(), finished_at: null },
        ],
        channel_agent_sessions: [],
        workspace_members: [{ user_id: 'anna', workspace_id: WORKSPACE }],
        agents: [{ id: 'ada', workspace_id: WORKSPACE, name: 'Ada', handle: 'ada', engine_agent_id: 'eng-ada', disabled_at: null }],
    }
    vi.mocked(createServiceRoleClient).mockReturnValue(workDatabase(rows).client)
    return rows
}

function runEnded(overrides: Row = {}) {
    const body = { event: 'agent.message.completed', kind: 'done', agentId: 'eng-ada', sessionId: 'engine-session', runId: 'run-1', message: 'Run finished', timestamp: '2026-11-12T10:01:00.000Z', metadata: { status: 'done' }, ...overrides }
    return new Request('https://lumvika.test/api/webhooks/engine', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` }, body: JSON.stringify(body) })
}

async function deliver(request: Request) {
    const response = await POST(request)
    while (afterTasks.queued.length > 0) await afterTasks.queued.shift()?.()
    return response
}

const answersOf = (rows: Tables) => rows.channel_messages.filter(row => row.author_agent_id === 'ada')

beforeEach(() => {
    vi.clearAllMocks()
    afterTasks.queued = []
    vi.mocked(authenticateEngineToken).mockImplementation(async token => (token === KEY ? { workspaceId: WORKSPACE, isSandbox: false } : null))
    vi.mocked(findWorkspaceEngine).mockResolvedValue({ instanceId: 'i', conn: CONN, managed: true })
    vi.mocked(recordNotification).mockResolvedValue({ ok: true } as never)
})

describe('POST /api/webhooks/engine for a coworker answering in a channel', () => {
    it('posts the answer in the thread of the message that asked, once, however often the engine reports', async () => {
        const rows = setup()
        vi.mocked(getRun).mockResolvedValue({ id: 'run-1', status: 'done', output: 'Three taglines.', error: null } as never)

        expect((await deliver(runEnded())).status).toBe(202)
        expect((await deliver(runEnded())).status).toBe(202)

        expect(answersOf(rows)).toEqual([expect.objectContaining({ body: 'Three taglines.', parent_message_id: 'ask', workspace_id: WORKSPACE })])
        expect(rows.channel_agent_turns[0]).toMatchObject({ status: 'answered', failure: null, reply_message_id: answersOf(rows)[0].id })
        expect(getRun).toHaveBeenCalledWith(CONN, 'eng-ada', 'run-1')
    })

    it('closes the turn of a run that failed with its reason and posts nothing', async () => {
        const rows = setup()
        vi.mocked(getRun).mockResolvedValue({ id: 'run-1', status: 'error', output: null, error: 'AI_APICallError: Set OPENROUTER_API_KEY to run the Lumvika models, or connect another AI provider in the app.' } as never)

        expect((await deliver(runEnded({ kind: 'error', metadata: { status: 'error' } }))).status).toBe(202)

        expect(rows.channel_agent_turns[0]).toMatchObject({ status: 'failed', failure: 'no_model' })
        expect(answersOf(rows)).toEqual([])
    })

    it('leaves the channel alone for a run that is not a channel turn, and for a token that names no machine', async () => {
        const rows = setup()
        vi.mocked(getRun).mockResolvedValue({ id: 'run-1', status: 'done', output: 'Three taglines.', error: null } as never)

        expect((await deliver(runEnded({ runId: 'someone-elses-run' }))).status).toBe(202)
        const forged = runEnded()
        forged.headers.set('authorization', 'Bearer forged')
        expect((await deliver(forged)).status).toBe(401)

        expect(rows.channel_agent_turns[0]).toMatchObject({ status: 'answering' })
        expect(answersOf(rows)).toEqual([])
    })
})
