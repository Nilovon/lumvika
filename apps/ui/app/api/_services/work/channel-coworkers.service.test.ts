import type { ChannelMessage } from '@lumvika/contracts'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { workDatabase, type Row, type Tables } from '@/test/work-fake'

const afterTasks = vi.hoisted(() => ({ queued: [] as Array<() => Promise<unknown>> }))

vi.mock('@/supabase/serviceRole', () => ({ createServiceRoleClient: vi.fn() }))
vi.mock('@/app/api/_auth/access', async importOriginal => ({ ...(await importOriginal<typeof import('@/app/api/_auth/access')>()), readAgentAccess: vi.fn(), callableEngineAgentIds: vi.fn() }))
vi.mock('@/app/api/_services/members.service', () => ({ resolveMemberIdentities: vi.fn() }))
vi.mock('@/app/api/_services/workspace-engine.service', () => ({ findWorkspaceEngine: vi.fn() }))
vi.mock('@/lib/chat/start-chat', () => ({ QUEUED_RETRY_DELAYS_MS: [], startChat: vi.fn() }))
vi.mock('@/lib/engine/client', async importOriginal => ({ ...(await importOriginal<typeof import('@/lib/engine/client')>()), getRun: vi.fn() }))
vi.mock('next/server', () => ({ after: (task: () => Promise<unknown>) => void afterTasks.queued.push(task) }))

const { createServiceRoleClient } = await import('@/supabase/serviceRole')
const { callableEngineAgentIds, readAgentAccess } = await import('@/app/api/_auth/access')
const { resolveMemberIdentities } = await import('@/app/api/_services/members.service')
const { findWorkspaceEngine } = await import('@/app/api/_services/workspace-engine.service')
const { startChat } = await import('@/lib/chat/start-chat')
const { EngineUnreachableError, getRun } = await import('@/lib/engine/client')
const { answerPlacement, answerWhatCameMeanwhile, channelRunEndingOf, claimTurn, coworkerPrompt, coworkersSummoned, failureOfRun, finishChannelTurnForRun, listChannelTurns, reactToChannelMessage, startCoworkerTurn, STALE_TURN_MS } = await import('./channel-coworkers.service')
const { postChannelMessage } = await import('./channels.service')

type ChannelPerson = import('./channels.service').ChannelPerson

const WORKSPACE = 7
const anna: ChannelPerson = { kind: 'user', userId: 'anna', workspaceId: WORKSPACE, role: 'member', boxScope: 'all' }
const ANNA = { kind: 'user', userId: 'anna' } as const
const ADA = { kind: 'agent', agentId: 'ada' } as const
const CONN = { baseUrl: 'http://engine', apiKey: 'key' }

function chatMessage(overrides: Partial<ChannelMessage> = {}): ChannelMessage {
    return { id: 'm1', channelId: 'pub', author: ANNA, body: 'hi', parentMessageId: null, mentions: [], editedAt: null, deletedAt: null, createdAt: '2026-11-01T00:00:00.000Z', ...overrides }
}

function channel(id: string, kind = 'public'): Row {
    return { id, workspace_id: WORKSPACE, name: id, description: null, kind, project_id: null, team_id: null, created_by: 'anna', archived_at: null, created_at: 'then', updated_at: 'then' }
}

function member(channelId: string, ref: { userId?: string; agentId?: string }): Row {
    return { id: `m-${channelId}-${ref.userId ?? ref.agentId}`, channel_id: channelId, workspace_id: WORKSPACE, user_id: ref.userId ?? null, agent_id: ref.agentId ?? null, last_read_at: null, created_at: 'then', updated_at: 'then' }
}

function engineAccepts(headers: Record<string, string> = { 'x-run-id': 'run-1', 'x-session-id': 'sess-1' }) {
    vi.mocked(startChat).mockResolvedValue(new Response(null, { status: 200, headers }))
}

function runEnds(run: Row) {
    vi.mocked(getRun).mockResolvedValue({ id: 'run-1', status: 'done', output: 'Here is the plan.', error: null, ...run } as never)
}

function setup(tables: Partial<Tables> = {}) {
    const rows: Tables = {
        channels: [channel('pub'), channel('dm-1', 'dm')],
        channel_members: [member('pub', { userId: 'anna' }), member('pub', { agentId: 'ada' }), member('dm-1', { userId: 'anna' }), member('dm-1', { agentId: 'ada' })],
        channel_messages: [],
        channel_agent_turns: [],
        channel_agent_sessions: [],
        workspace_members: [{ user_id: 'anna', workspace_id: WORKSPACE }],
        agents: [
            { id: 'ada', workspace_id: WORKSPACE, name: 'Ada', handle: 'ada', engine_agent_id: 'eng-ada', disabled_at: null },
            { id: 'max', workspace_id: WORKSPACE, name: 'Max', handle: 'max', engine_agent_id: 'eng-max', disabled_at: null },
        ],
        ...tables,
    }
    const db = workDatabase(rows, { unique: { channel_agent_turns: (row, existing) => row.status === 'answering' && existing.status === 'answering' && row.agent_id === existing.agent_id && row.thread_message_id === existing.thread_message_id } })
    vi.mocked(createServiceRoleClient).mockReturnValue(db.client)
    return { db, rows, scope: { workspaceId: WORKSPACE, supabase: db.client } }
}

async function drainAfter() {
    while (afterTasks.queued.length > 0) await afterTasks.queued.shift()?.()
}

beforeEach(() => {
    vi.clearAllMocks()
    afterTasks.queued = []
    vi.mocked(readAgentAccess).mockResolvedValue('use')
    vi.mocked(callableEngineAgentIds).mockResolvedValue(undefined)
    vi.mocked(resolveMemberIdentities).mockResolvedValue(new Map([['anna', { email: 'anna@acme.test', name: 'Anna', avatarUrl: null }]]) as never)
    vi.mocked(findWorkspaceEngine).mockResolvedValue({ instanceId: 'i', conn: CONN, managed: true })
    engineAccepts()
    runEnds({})
})

describe('coworkersSummoned', () => {
    const members = new Set(['ada'])

    it('summons a mentioned member and names a mentioned outsider', () => {
        expect(coworkersSummoned({ channelKind: 'public', message: chatMessage({ mentions: [ADA, { kind: 'agent', agentId: 'max' }] }), agentMembers: members, thread: null })).toEqual({ agentIds: ['ada'], outsiders: ['max'] })
    })

    it('summons the coworker of a direct message without a mention', () => {
        expect(coworkersSummoned({ channelKind: 'dm', message: chatMessage(), agentMembers: members, thread: null }).agentIds).toEqual(['ada'])
    })

    it('summons the coworker that started the thread or was mentioned in it', () => {
        const reply = chatMessage({ id: 'r2', parentMessageId: 'root' })
        const startedByAda = { root: chatMessage({ id: 'root', author: ADA }), replies: [reply] }
        expect(coworkersSummoned({ channelKind: 'public', message: reply, agentMembers: members, thread: startedByAda }).agentIds).toEqual(['ada'])
        const mentionedEarlier = { root: chatMessage({ id: 'root' }), replies: [chatMessage({ id: 'r1', parentMessageId: 'root', mentions: [ADA] }), reply] }
        expect(coworkersSummoned({ channelKind: 'public', message: reply, agentMembers: members, thread: mentionedEarlier }).agentIds).toEqual(['ada'])
    })

    it('summons nobody for a plain message, a coworker message or a deleted one', () => {
        expect(coworkersSummoned({ channelKind: 'public', message: chatMessage(), agentMembers: members, thread: null }).agentIds).toEqual([])
        expect(coworkersSummoned({ channelKind: 'dm', message: chatMessage({ author: ADA, mentions: [ADA] }), agentMembers: members, thread: null }).agentIds).toEqual([])
        expect(coworkersSummoned({ channelKind: 'dm', message: chatMessage({ deletedAt: 'then' }), agentMembers: members, thread: null }).agentIds).toEqual([])
        const unrelated = { root: chatMessage({ id: 'root' }), replies: [] }
        expect(coworkersSummoned({ channelKind: 'public', message: chatMessage({ id: 'r1', parentMessageId: 'root' }), agentMembers: members, thread: unrelated }).agentIds).toEqual([])
    })
})

describe('answerPlacement', () => {
    it('answers a channel message in its thread, a reply in its thread, a dm in the conversation', () => {
        expect(answerPlacement('public', { id: 'm1', parentMessageId: null })).toEqual({ threadMessageId: 'm1', replyParentId: 'm1' })
        expect(answerPlacement('public', { id: 'r1', parentMessageId: 'm1' })).toEqual({ threadMessageId: 'm1', replyParentId: 'm1' })
        expect(answerPlacement('dm', { id: 'm1', parentMessageId: null })).toEqual({ threadMessageId: 'm1', replyParentId: null })
    })
})

describe('reactToChannelMessage', () => {
    it('answers after the response, in the thread, as the coworker, on one conversation per channel', async () => {
        const { rows, scope } = setup()
        const message = await postChannelMessage(scope, ANNA, 'pub', { body: 'Can you draft the plan @ada?' })

        const summons = await reactToChannelMessage(scope, anna, message)
        expect(summons).toEqual({ agentIds: ['ada'], outsiders: [] })
        expect(startChat).not.toHaveBeenCalled()
        await drainAfter()

        expect(startChat).toHaveBeenCalledWith(CONN, 'eng-ada', expect.objectContaining({ source: 'channel', sessionId: undefined, author: { id: 'anna', name: 'Anna' } }), expect.any(Array))
        const prompt = vi.mocked(startChat).mock.calls[0][2].message
        expect(prompt).toContain('#pub')
        expect(prompt).toContain('Anna wrote:\nCan you draft the plan @ada?')
        expect(prompt).toContain('you cannot hand it to another coworker nor keep it in your memory, skills or the company brain')

        const answer = rows.channel_messages.find(row => row.author_agent_id === 'ada')
        expect(answer).toMatchObject({ body: 'Here is the plan.', parent_message_id: message.id, author_user_id: null })
        expect(rows.channel_agent_turns).toEqual([expect.objectContaining({ agent_id: 'ada', thread_message_id: message.id, status: 'answered', reply_message_id: answer?.id, engine_run_id: 'run-1' })])
        expect(rows.channel_agent_sessions).toEqual([expect.objectContaining({ channel_id: 'pub', agent_id: 'ada', engine_session_id: 'sess-1' })])
        expect(rows.sessions).toBeUndefined()

        const followUp = await postChannelMessage(scope, ANNA, 'pub', { body: 'thanks, one more thing', parentMessageId: message.id })
        await reactToChannelMessage(scope, anna, followUp)
        await drainAfter()
        expect(vi.mocked(startChat).mock.calls[1][2]).toMatchObject({ sessionId: 'sess-1' })
        expect(vi.mocked(startChat).mock.calls[1][2].message).toContain('- You: Here is the plan.')
    })

    it('never answers its own message, and leaves a coworker outside the channel to the person', async () => {
        const { rows, scope } = setup()
        const own = await postChannelMessage(scope, ADA, 'dm-1', { body: 'Done @ada' })
        await expect(reactToChannelMessage(scope, anna, own)).resolves.toEqual({ agentIds: [], outsiders: [] })
        const outside = await postChannelMessage(scope, ANNA, 'pub', { body: 'ping @max' })
        await expect(reactToChannelMessage(scope, anna, outside)).resolves.toEqual({ agentIds: [], outsiders: ['max'] })
        await drainAfter()
        expect(startChat).not.toHaveBeenCalled()
        expect(rows.channel_agent_turns).toEqual([])
    })

    it('answers a direct message straight in the conversation', async () => {
        const { rows, scope } = setup()
        const message = await postChannelMessage(scope, ANNA, 'dm-1', { body: 'hello' })
        await reactToChannelMessage(scope, anna, message)
        await drainAfter()
        expect(rows.channel_messages.find(row => row.author_agent_id === 'ada')).toMatchObject({ parent_message_id: null })
        expect(vi.mocked(startChat).mock.calls[0][2].message).toContain('a direct message')
    })

    it('records why a coworker the person cannot reach does not answer', async () => {
        const { rows, scope } = setup()
        vi.mocked(readAgentAccess).mockResolvedValue('none')
        await reactToChannelMessage(scope, anna, await postChannelMessage(scope, ANNA, 'pub', { body: '@ada?' }))
        await drainAfter()
        expect(startChat).not.toHaveBeenCalled()
        expect(rows.channel_agent_turns).toEqual([expect.objectContaining({ status: 'failed', failure: 'no_access' })])
    })
})

describe('claimTurn', () => {
    it('gives way to the answer already in flight in the thread', async () => {
        const db = workDatabase({}, { refuse: { channel_agent_turns: { code: '23505', message: 'duplicate key' } } })
        await expect(claimTurn({ workspaceId: WORKSPACE, supabase: db.client }, { channelId: 'pub', agentId: 'ada', threadMessageId: 'm1', triggerMessageId: 'm1', requestedBy: 'anna' })).resolves.toBeNull()
    })
})

describe('starting a coworker turn', () => {
    async function start(rowsOverride: Partial<Tables> = {}) {
        const { rows, scope } = setup(rowsOverride)
        const trigger = await postChannelMessage(scope, ANNA, 'pub', { body: '@ada go' })
        const turn = await claimTurn(scope, { channelId: 'pub', agentId: 'ada', threadMessageId: trigger.id, triggerMessageId: trigger.id, requestedBy: 'anna' })
        await startCoworkerTurn(scope, { turn: turn!, person: anna, trigger }, [])
        return { turn: rows.channel_agent_turns[0], rows, scope, trigger }
    }

    it('stores the run and returns while it goes on, the answer comes with the webhook', async () => {
        runEnds({ status: 'running', output: null })
        const { turn, rows } = await start()
        expect(turn).toMatchObject({ status: 'answering', engine_run_id: 'run-1' })
        expect(rows.channel_messages.filter(row => row.author_agent_id === 'ada')).toEqual([])
    })

    it('names an engine that cannot be reached', async () => {
        vi.mocked(findWorkspaceEngine).mockResolvedValue(null)
        await expect(start().then(result => result.turn)).resolves.toMatchObject({ status: 'failed', failure: 'engine_unreachable', finished_at: expect.any(String) })
        vi.mocked(findWorkspaceEngine).mockResolvedValue({ instanceId: 'i', conn: CONN, managed: true })
        vi.mocked(startChat).mockRejectedValue(new EngineUnreachableError(new Error('ECONNREFUSED')))
        await expect(start().then(result => result.turn)).resolves.toMatchObject({ failure: 'engine_unreachable' })
    })

    it('names a coworker switched off', async () => {
        const { turn } = await start({ agents: [{ id: 'ada', workspace_id: WORKSPACE, name: 'Ada', engine_agent_id: 'eng-ada', disabled_at: 'then' }] })
        expect(turn).toMatchObject({ failure: 'coworker_disabled' })
        expect(startChat).not.toHaveBeenCalled()
    })

    it('names an engine too old for channels', async () => {
        vi.mocked(startChat).mockResolvedValue(new Response('{"error":"source: Invalid option"}', { status: 400 }))
        await expect(start().then(result => result.turn)).resolves.toMatchObject({ failure: 'engine_outdated' })
    })

    it('closes a run that ended before its id was stored, without waiting for the webhook', async () => {
        runEnds({ status: 'error', output: null, error: 'AI_APICallError: invalid x-api-key' })
        await expect(start().then(result => result.turn)).resolves.toMatchObject({ status: 'failed', failure: 'no_model' })
    })

    it('starts a new conversation when the engine lost the one it had', async () => {
        vi.mocked(startChat).mockResolvedValueOnce(new Response('{"error":"session not found for this agent"}', { status: 404 }))
        const { turn } = await start({ channel_agent_sessions: [{ channel_id: 'pub', agent_id: 'ada', workspace_id: WORKSPACE, engine_session_id: 'lost' }] })
        expect(vi.mocked(startChat).mock.calls.map(call => call[2].sessionId)).toEqual(['lost', undefined])
        expect(turn).toMatchObject({ status: 'answered' })
    })

    it('runs in a conversation of its own while the channel one is busy, and keeps the channel one', async () => {
        engineAccepts({ 'x-run-id': 'run-1', 'x-session-id': 'side' })
        vi.mocked(startChat).mockResolvedValueOnce(new Response('{"code":"run_in_flight"}', { status: 409 }))
        const { rows, turn } = await start({ channel_agent_sessions: [{ channel_id: 'pub', agent_id: 'ada', workspace_id: WORKSPACE, engine_session_id: 'main' }] })
        expect(vi.mocked(startChat).mock.calls.map(call => call[2].sessionId)).toEqual(['main', undefined])
        expect(turn).toMatchObject({ status: 'answered' })
        expect(rows.channel_agent_sessions).toEqual([expect.objectContaining({ engine_session_id: 'main' })])
        expect(rows.sessions).toBeUndefined()
    })
})

describe('finishing from the run-end webhook', () => {
    async function inFlight(tables: Partial<Tables> = {}) {
        runEnds({ status: 'running', output: null })
        const { rows, scope } = setup(tables)
        const trigger = await postChannelMessage(scope, ANNA, 'pub', { body: '@ada draft it' })
        const turn = await claimTurn(scope, { channelId: 'pub', agentId: 'ada', threadMessageId: trigger.id, triggerMessageId: trigger.id, requestedBy: 'anna' })
        await startCoworkerTurn(scope, { turn: turn!, person: anna, trigger }, [])
        return { rows, scope, trigger }
    }

    const done = { event: 'agent.message.completed', kind: 'done', runId: 'run-1', source: null, metadata: { status: 'done' } }

    it('posts the answer once, however many times the webhook comes', async () => {
        const { rows, scope, trigger } = await inFlight()
        runEnds({ status: 'done', output: 'Three taglines.' })
        await expect(finishChannelTurnForRun(scope, channelRunEndingOf(done)!)).resolves.toBe('answered')
        await expect(finishChannelTurnForRun(scope, channelRunEndingOf(done)!)).resolves.toBe('already')
        const answers = rows.channel_messages.filter(row => row.author_agent_id === 'ada')
        expect(answers).toEqual([expect.objectContaining({ body: 'Three taglines.', parent_message_id: trigger.id })])
        expect(rows.channel_agent_turns[0]).toMatchObject({ status: 'answered', reply_message_id: answers[0].id })
        expect(getRun).toHaveBeenLastCalledWith(CONN, 'eng-ada', 'run-1')
    })

    it('closes a failed run with its reason and posts nothing', async () => {
        const { rows, scope } = await inFlight()
        runEnds({ status: 'error', output: null, error: 'AI_APICallError: Set OPENROUTER_API_KEY to run the Lumvika models, or connect another AI provider in the app.' })
        await expect(finishChannelTurnForRun(scope, channelRunEndingOf({ ...done, kind: 'error', metadata: { status: 'error' } })!)).resolves.toBe('failed')
        expect(rows.channel_agent_turns[0]).toMatchObject({ status: 'failed', failure: 'no_model' })
        expect(rows.channel_messages.filter(row => row.author_agent_id === 'ada')).toEqual([])
    })

    it('closes a run stopped on purpose as cancelled', async () => {
        const { rows, scope } = await inFlight()
        runEnds({ status: 'cancelled', output: 'half an answer' })
        await finishChannelTurnForRun(scope, channelRunEndingOf({ ...done, metadata: { status: 'cancelled' } })!)
        expect(rows.channel_agent_turns[0]).toMatchObject({ status: 'failed', failure: 'cancelled' })
        expect(rows.channel_messages.filter(row => row.author_agent_id === 'ada')).toEqual([])
    })

    it('closes a run that stopped on a question for the person, keeping what it said', async () => {
        const { rows, scope } = await inFlight()
        runEnds({ status: 'done', output: 'Before I start: which tone?' })
        const ending = channelRunEndingOf({ event: 'agent.notification', kind: 'question', runId: 'run-1', metadata: { toolName: 'ask_user' } })
        expect(ending).toEqual({ runId: 'run-1', ending: 'needs_input' })
        await expect(finishChannelTurnForRun(scope, ending!)).resolves.toBe('failed')
        expect(rows.channel_agent_turns[0]).toMatchObject({ status: 'failed', failure: 'needs_input', reply_message_id: expect.any(String) })
        expect(rows.channel_messages.filter(row => row.author_agent_id === 'ada')).toEqual([expect.objectContaining({ body: 'Before I start: which tone?' })])
    })

    it('times out a turn its run never reported, and still takes a late answer', async () => {
        const { rows, scope } = await inFlight()
        rows.channel_agent_turns[0].created_at = new Date(Date.now() - STALE_TURN_MS - 60_000).toISOString()
        await expect(listChannelTurns(scope, 'pub')).resolves.toEqual([expect.objectContaining({ status: 'failed', failure: 'timeout' })])
        runEnds({ status: 'done', output: 'Sorry, that took a while.' })
        await expect(finishChannelTurnForRun(scope, channelRunEndingOf(done)!)).resolves.toBe('answered')
        expect(rows.channel_agent_turns[0]).toMatchObject({ status: 'answered', failure: null })
    })

    it('matches by run id alone, whatever source the engine reports, and ignores the rest', async () => {
        expect(channelRunEndingOf({ ...done, source: 'channel' })).toEqual({ runId: 'run-1', ending: 'done' })
        expect(channelRunEndingOf({ event: 'agent.message.completed', kind: 'done', metadata: null })).toBeNull()
        expect(channelRunEndingOf({ event: 'agent.notification', kind: 'info', runId: 'run-1' })).toBeNull()
        const { scope } = setup()
        await expect(finishChannelTurnForRun(scope, { runId: 'someone-elses-run', ending: 'done' })).resolves.toBe('none')
    })
})

describe('messages that come while the coworker is still answering', () => {
    const done = { event: 'agent.message.completed', kind: 'done', runId: 'run-1', source: null, metadata: { status: 'done' } }

    async function busyThread() {
        runEnds({ status: 'running', output: null })
        const { rows, scope } = setup()
        const root = await postChannelMessage(scope, ANNA, 'pub', { body: '@ada draft the plan' })
        await reactToChannelMessage(scope, anna, root)
        await drainAfter()
        const first = await postChannelMessage(scope, ANNA, 'pub', { body: 'and keep it short', parentMessageId: root.id })
        await reactToChannelMessage(scope, anna, first)
        const second = await postChannelMessage(scope, ANNA, 'pub', { body: 'in French please', parentMessageId: root.id })
        await reactToChannelMessage(scope, anna, second)
        await drainAfter()
        engineAccepts({ 'x-run-id': 'run-2', 'x-session-id': 'sess-1' })
        return { rows, scope, root, second }
    }

    it('keeps one answer running, then answers everything that came meanwhile once', async () => {
        const { rows, scope, second } = await busyThread()
        expect(startChat).toHaveBeenCalledTimes(1)
        expect(rows.channel_agent_turns).toHaveLength(1)

        runEnds({ status: 'done', output: 'Here is the plan.' })
        await finishChannelTurnForRun(scope, channelRunEndingOf(done)!)
        await drainAfter()

        expect(startChat).toHaveBeenCalledTimes(2)
        const prompt = vi.mocked(startChat).mock.calls[1][2].message
        expect(prompt).toContain('- Anna: and keep it short')
        expect(vi.mocked(startChat).mock.calls[1][2]).toMatchObject({ sessionId: 'sess-1' })
        expect(prompt).toContain('Anna wrote:\nin French please')
        expect(rows.channel_agent_turns).toEqual([expect.objectContaining({ status: 'answered' }), expect.objectContaining({ trigger_message_id: second.id, status: 'answered', requested_by: 'anna' })])
        expect(rows.channel_messages.filter(row => row.author_agent_id === 'ada')).toHaveLength(2)
    })

    it('still answers them when the first answer failed', async () => {
        const { rows, scope } = await busyThread()
        runEnds({ status: 'error', output: null, error: 'AI_APICallError: Internal server error' })
        await finishChannelTurnForRun(scope, channelRunEndingOf({ ...done, kind: 'error', metadata: { status: 'error' } })!)
        runEnds({ status: 'done', output: 'Voici le plan.' })
        await drainAfter()
        expect(startChat).toHaveBeenCalledTimes(2)
        expect(rows.channel_agent_turns.map(turn => turn.status)).toEqual(['failed', 'answered'])
    })

    it('waits while the answer still runs, and starts nothing once nothing new is left', async () => {
        runEnds({ status: 'running', output: null })
        const { rows, scope } = setup()
        const root = await postChannelMessage(scope, ANNA, 'pub', { body: '@ada draft the plan' })
        await reactToChannelMessage(scope, anna, root)
        await drainAfter()
        const place = { channelId: 'pub', agentId: 'ada', threadMessageId: root.id }
        await postChannelMessage(scope, ANNA, 'pub', { body: 'and in French', parentMessageId: root.id })
        await expect(answerWhatCameMeanwhile(scope, place)).resolves.toBe(false)
        expect(startChat).toHaveBeenCalledTimes(1)

        engineAccepts({ 'x-run-id': 'run-2', 'x-session-id': 'sess-1' })
        runEnds({ status: 'done', output: 'Here is the plan.' })
        await finishChannelTurnForRun(scope, channelRunEndingOf(done)!)
        await drainAfter()
        expect(startChat).toHaveBeenCalledTimes(2)
        await expect(answerWhatCameMeanwhile(scope, place)).resolves.toBe(false)
        await drainAfter()
        expect(startChat).toHaveBeenCalledTimes(2)
        expect(rows.channel_agent_turns.map(turn => turn.status)).toEqual(['answered', 'answered'])
    })

    it('starts nothing after an answer when nobody wrote meanwhile', async () => {
        runEnds({ status: 'running', output: null })
        const { scope } = setup()
        await reactToChannelMessage(scope, anna, await postChannelMessage(scope, ANNA, 'pub', { body: '@ada draft the plan' }))
        await drainAfter()
        runEnds({ status: 'done', output: 'Here is the plan.' })
        await finishChannelTurnForRun(scope, channelRunEndingOf(done)!)
        await drainAfter()
        expect(startChat).toHaveBeenCalledTimes(1)
    })
})

describe('failureOfRun and coworkerPrompt', () => {
    it('reads an engine without a usable model as such', () => {
        expect(failureOfRun({ status: 'error', output: null, error: 'AI_APICallError: Set OPENROUTER_API_KEY to run the Lumvika models, or connect another AI provider in the app.' })).toBe('no_model')
        expect(failureOfRun({ status: 'error', output: null, error: 'AI_APICallError: Internal server error' })).toBe('failed')
    })

    it('reads an empty answer as a failure', () => {
        expect(failureOfRun({ status: 'done', output: '  ', error: null })).toBe('failed')
        expect(failureOfRun({ status: 'done', output: 'ok', error: null })).toBeNull()
    })

    it('caps the conversation it hands over', () => {
        const context = Array.from({ length: 40 }, (_, index) => chatMessage({ id: `c${index}`, body: `line ${index}` }))
        const prompt = coworkerPrompt({ channelName: 'pub', channelKind: 'public', agentId: 'ada', trigger: chatMessage({ id: 'last', body: 'now' }), context, inThread: false }, { personName: () => 'Anna', agentName: () => 'Ada' })
        expect(prompt).toContain('line 39')
        expect(prompt).not.toContain('line 19\n')
        expect(prompt.match(/^- /gm)).toHaveLength(20)
    })
})
