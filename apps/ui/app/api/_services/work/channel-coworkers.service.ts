import 'server-only'

import { classifyChatError, type ChannelKind, type ChannelMessage, type WorkMemberRef } from '@lumvika/contracts'
import { after } from 'next/server'

import { callableEngineAgentIds, readAgentAccess } from '@/app/api/_auth/access'
import type { Database } from '@/app/api/database.types'
import { ensureSessionRow } from '@/app/api/_services/chat.service'
import { resolveMemberIdentities } from '@/app/api/_services/members.service'
import { getChannel, listThread, postChannelMessage, type ChannelPerson } from '@/app/api/_services/work/channels.service'
import { CHANNEL_MESSAGE_COLUMNS } from '@/app/api/_services/work/columns'
import { toChannelMessage } from '@/app/api/_services/work/mappers'
import { clientOf, sameMember, type WorkScope } from '@/app/api/_services/work/refs'
import { findWorkspaceEngine } from '@/app/api/_services/workspace-engine.service'
import { QUEUED_RETRY_DELAYS_MS, startChat } from '@/lib/chat/start-chat'
import { EngineUnreachableError, getRun } from '@/lib/engine/client'
import type { EngineConnection, EngineRunDetail } from '@/lib/engine/types'
import { selectAll, selectMany, selectMaybeSingle, type TableRow } from '@/supabase/supabase-helpers'

// A coworker answering in a channel. A person's message summons the coworkers it mentions, the
// coworker of a direct message, and the coworkers already in the thread it replies to. The hub asks
// each one through the same engine `/chat` a person's chat uses (source `channel`, one engine
// conversation per coworker and channel), waits for the run, and posts its answer as the coworker.
// Every answer is a `channel_agent_turns` row everyone in the channel reads: "answering" while it
// runs, then answered, or failed with the reason the thread shows.

export const CHANNEL_AGENT_TURN_COLUMNS = ['id', 'channel_id', 'agent_id', 'thread_message_id', 'trigger_message_id', 'status', 'failure', 'reply_message_id', 'created_at', 'finished_at'] as const
export type ChannelAgentTurnRow = Pick<TableRow<'channel_agent_turns'>, (typeof CHANNEL_AGENT_TURN_COLUMNS)[number]>

export const TURN_FAILURES = ['engine_unreachable', 'engine_outdated', 'coworker_disabled', 'no_model', 'no_access', 'not_member', 'timeout', 'failed'] as const
export type TurnFailure = (typeof TURN_FAILURES)[number]

export type ChannelAgentTurn = {
    id: string
    channelId: string
    agentId: string
    threadMessageId: string
    triggerMessageId: string
    status: 'answering' | 'answered' | 'failed'
    failure: TurnFailure | null
    replyMessageId: string | null
    createdAt: string
    finishedAt: string | null
}

type TurnUpdate = Database['public']['Tables']['channel_agent_turns']['Update']

const UNIQUE_VIOLATION = '23505'
// Past this, a turn still marked answering belongs to a request that died with its server.
export const STALE_TURN_MS = 15 * 60_000
const RUN_WAIT_MS = 10 * 60_000
const RUN_POLL_MS = 2_000
// The engine holds one run per conversation: a coworker already answering elsewhere in the channel
// finishes first, for up to about five minutes.
const BUSY_RETRY_DELAYS_MS = [...QUEUED_RETRY_DELAYS_MS, ...Array.from({ length: 27 }, () => 10_000)]
const CONTEXT_MESSAGES = 20
const CONTEXT_MESSAGE_CHARS = 1_500
const CONTEXT_TOTAL_CHARS = 12_000
const TURN_RETURNING = CHANNEL_AGENT_TURN_COLUMNS.join(',')

export function toChannelAgentTurn(row: ChannelAgentTurnRow): ChannelAgentTurn {
    const failure = (TURN_FAILURES as readonly string[]).includes(row.failure ?? '') ? (row.failure as TurnFailure) : row.failure ? 'failed' : null
    const status = row.status === 'answered' || row.status === 'failed' ? row.status : 'answering'
    return { id: row.id, channelId: row.channel_id, agentId: row.agent_id, threadMessageId: row.thread_message_id, triggerMessageId: row.trigger_message_id, status, failure, replyMessageId: row.reply_message_id, createdAt: row.created_at, finishedAt: row.finished_at }
}

export type SummonContext = {
    channelKind: ChannelKind
    message: ChannelMessage
    // The coworkers that are members of the channel.
    agentMembers: ReadonlySet<string>
    // The thread the message replies to, earlier replies included; null for a top-level message.
    thread: { root: ChannelMessage; replies: ChannelMessage[] } | null
}

export type Summons = { agentIds: string[]; outsiders: string[] }

function agentsOf(refs: readonly WorkMemberRef[]): string[] {
    return refs.flatMap(ref => (ref.kind === 'agent' ? [ref.agentId] : []))
}

// Which coworkers a message asks to answer. Only a person's message summons anyone, so a coworker
// never sets another one off. `outsiders` are the coworkers it mentions that are not in the channel:
// the screen offers to add them.
export function coworkersSummoned({ channelKind, message, agentMembers, thread }: SummonContext): Summons {
    if (message.author.kind !== 'user' || message.deletedAt) return { agentIds: [], outsiders: [] }
    const mentioned = agentsOf(message.mentions)
    const candidates = new Set(mentioned)
    if (channelKind === 'dm') for (const agentId of agentMembers) candidates.add(agentId)
    if (thread) {
        for (const earlier of [thread.root, ...thread.replies]) {
            if (earlier.id === message.id || earlier.deletedAt) continue
            if (earlier.author.kind === 'agent') candidates.add(earlier.author.agentId)
            for (const agentId of agentsOf(earlier.mentions)) candidates.add(agentId)
        }
    }
    return {
        agentIds: [...candidates].filter(agentId => agentMembers.has(agentId)),
        outsiders: [...new Set(mentioned)].filter(agentId => !agentMembers.has(agentId)),
    }
}

// Where an answer goes: in the thread of a reply, under a top-level message in a channel so the
// channel stays readable, and straight in the conversation of a direct message.
export function answerPlacement(channelKind: ChannelKind, message: Pick<ChannelMessage, 'id' | 'parentMessageId'>): { threadMessageId: string; replyParentId: string | null } {
    if (message.parentMessageId) return { threadMessageId: message.parentMessageId, replyParentId: message.parentMessageId }
    if (channelKind === 'dm') return { threadMessageId: message.id, replyParentId: null }
    return { threadMessageId: message.id, replyParentId: message.id }
}

async function agentMembersOf(scope: WorkScope, channelId: string): Promise<Set<string>> {
    const { data } = await selectAll(clientOf(scope), 'channel_members', ['agent_id'] as const, { channel_id: channelId, workspace_id: scope.workspaceId, agent_id: { notNull: true } })
    return new Set((data ?? []).flatMap(row => (row.agent_id ? [row.agent_id] : [])))
}

async function finishTurn(scope: WorkScope, turnId: string, patch: TurnUpdate): Promise<void> {
    const { error } = await clientOf(scope)
        .from('channel_agent_turns')
        .update<TurnUpdate>({ ...patch, finished_at: new Date().toISOString() })
        .eq('id', turnId)
        .eq('workspace_id', scope.workspaceId)
    if (error) console.error('[channels] failed to close the coworker turn', turnId, error.message)
}

async function failTurn(scope: WorkScope, turnId: string, failure: TurnFailure): Promise<void> {
    await finishTurn(scope, turnId, { status: 'failed', failure })
}

type TurnRequest = { channelId: string; agentId: string; threadMessageId: string; triggerMessageId: string; requestedBy: string | null }

// One answer per coworker and thread at a time: the partial unique index refuses a second while the
// first runs. A turn left answering by a request that died is closed first, so it blocks nobody.
export async function claimTurn(scope: WorkScope, request: TurnRequest, initial: { status: 'answering' } | { status: 'failed'; failure: TurnFailure } = { status: 'answering' }): Promise<ChannelAgentTurn | null> {
    const supabase = clientOf(scope)
    const staleBefore = new Date(Date.now() - STALE_TURN_MS).toISOString()
    await supabase
        .from('channel_agent_turns')
        .update<TurnUpdate>({ status: 'failed', failure: 'timeout', finished_at: new Date().toISOString() })
        .eq('agent_id', request.agentId)
        .eq('thread_message_id', request.threadMessageId)
        .eq('status', 'answering')
        .lt('created_at', staleBefore)

    const { data, error } = await supabase
        .from('channel_agent_turns')
        .insert<Database['public']['Tables']['channel_agent_turns']['Insert']>({
            channel_id: request.channelId,
            workspace_id: scope.workspaceId,
            agent_id: request.agentId,
            thread_message_id: request.threadMessageId,
            trigger_message_id: request.triggerMessageId,
            requested_by: request.requestedBy,
            status: initial.status,
            failure: initial.status === 'failed' ? initial.failure : null,
            finished_at: initial.status === 'failed' ? new Date().toISOString() : null,
        })
        .select(TURN_RETURNING)
        .single<ChannelAgentTurnRow>()
    if (error?.code === UNIQUE_VIOLATION) return null
    if (error || !data) throw new Error(`Failed to start the coworker turn: ${error?.message}`)
    return toChannelAgentTurn(data)
}

export async function listChannelTurns(scope: WorkScope, channelId: string, limit = 200): Promise<ChannelAgentTurn[]> {
    const { data, error } = await selectMany(clientOf(scope), 'channel_agent_turns', CHANNEL_AGENT_TURN_COLUMNS, { channel_id: channelId, workspace_id: scope.workspaceId }, { column: 'created_at', ascending: false }, limit)
    if (error) throw new Error(`Failed to read the coworker turns: ${error.message}`)
    return (data ?? []).map(toChannelAgentTurn).reverse()
}

type Names = { personName: (userId: string | null) => string; agentName: (agentId: string | null) => string }

async function namesFor(scope: WorkScope, messages: ChannelMessage[]): Promise<Names> {
    const supabase = clientOf(scope)
    const userIds = [...new Set(messages.flatMap(message => (message.author.kind === 'user' ? [message.author.userId] : [])))]
    const agentIds = [...new Set(messages.flatMap(message => (message.author.kind === 'agent' ? [message.author.agentId] : [])))]
    const [identities, { data: agents }] = await Promise.all([
        userIds.length > 0 ? resolveMemberIdentities(supabase, userIds) : Promise.resolve(new Map<string, { name: string | null }>()),
        agentIds.length > 0 ? selectMany(supabase, 'agents', ['id', 'name'] as const, { id: agentIds, workspace_id: scope.workspaceId }) : Promise.resolve({ data: [] }),
    ])
    const agentNames = new Map((agents ?? []).map(agent => [agent.id, agent.name]))
    return {
        personName: userId => (userId ? (identities.get(userId)?.name ?? 'A teammate') : 'Someone'),
        agentName: agentId => (agentId ? (agentNames.get(agentId) ?? 'A coworker') : 'A coworker'),
    }
}

function clip(text: string, max: number): string {
    return text.length > max ? `${text.slice(0, max)}…` : text
}

export type CoworkerBrief = {
    channelName: string
    channelKind: ChannelKind
    agentId: string
    trigger: ChannelMessage
    // Oldest first, the trigger last.
    context: ChannelMessage[]
    inThread: boolean
}

// What the coworker reads: where it is, who wrote, the conversation so far (capped) and the message
// to answer. Its whole answer is posted as is.
export function coworkerPrompt(brief: CoworkerBrief, names: Names): string {
    const where = brief.channelKind === 'dm' ? 'a direct message in Lumvika' : `the Lumvika channel #${brief.channelName}${brief.inThread ? ', in a thread' : ''}`
    const speaker = (message: ChannelMessage) => {
        if (message.author.kind === 'agent') return message.author.agentId === brief.agentId ? 'You' : `${names.agentName(message.author.agentId)} (coworker)`
        if (message.author.kind === 'user') return names.personName(message.author.userId)
        return 'Someone'
    }
    const lines: string[] = []
    let budget = CONTEXT_TOTAL_CHARS
    for (const message of [...brief.context].reverse()) {
        if (message.id === brief.trigger.id || message.deletedAt) continue
        const line = `- ${speaker(message)}: ${clip(message.body, CONTEXT_MESSAGE_CHARS)}`
        if (line.length > budget || lines.length >= CONTEXT_MESSAGES) break
        budget -= line.length
        lines.unshift(line)
    }
    return [
        `You are answering in ${where}, where people and coworkers talk together.`,
        lines.length > 0 ? `The conversation so far:\n${lines.join('\n')}` : null,
        `${speaker(brief.trigger)} wrote:\n${brief.trigger.body}`,
        'Reply to them. Your whole reply is posted as your message, so write only what they should read.',
    ]
        .filter(Boolean)
        .join('\n\n')
}

async function contextFor(scope: WorkScope, channelId: string, trigger: ChannelMessage): Promise<ChannelMessage[]> {
    if (trigger.parentMessageId) {
        const thread = await listThread(scope, channelId, trigger.parentMessageId)
        return [thread.root, ...thread.replies.filter(reply => reply.createdAt <= trigger.createdAt)]
    }
    const { data } = await selectMany(clientOf(scope), 'channel_messages', CHANNEL_MESSAGE_COLUMNS, { channel_id: channelId, workspace_id: scope.workspaceId, parent_message_id: { isNull: true }, created_at: { lte: trigger.createdAt } }, { column: 'created_at', ascending: false }, CONTEXT_MESSAGES + 1)
    return (data ?? []).map(toChannelMessage).reverse()
}

type ChatOutcome = { ok: true; runId: string; sessionId: string | null } | { ok: false; failure: TurnFailure; sessionGone?: boolean }

async function sendToEngine(conn: EngineConnection, engineAgentId: string, params: Parameters<typeof startChat>[2], delays: readonly number[]): Promise<ChatOutcome> {
    let res: Response
    try {
        res = await startChat(conn, engineAgentId, params, delays)
    } catch (err) {
        if (err instanceof EngineUnreachableError) return { ok: false, failure: 'engine_unreachable' }
        throw err
    }
    if (!res.ok) {
        const body = await res.text().catch(() => '')
        if (res.status === 404 && params.sessionId) return { ok: false, failure: 'failed', sessionGone: true }
        if (res.status === 403) return { ok: false, failure: 'coworker_disabled' }
        // An engine that predates the `channel` source refuses it by name: `source: Invalid option`.
        if (res.status === 400 && /\bsource\b/i.test(body)) return { ok: false, failure: 'engine_outdated' }
        if (res.status === 502 || res.status === 503 || res.status === 504) return { ok: false, failure: 'engine_unreachable' }
        console.error('[channels] the engine refused the coworker turn', res.status, body.slice(0, 300))
        return { ok: false, failure: 'failed' }
    }
    const runId = res.headers.get('x-run-id')
    const sessionId = res.headers.get('x-session-id')
    // The engine buffers the run on its side: dropping the stream reads as one listener leaving.
    await res.body?.cancel().catch(() => {})
    if (!runId) return { ok: false, failure: 'failed' }
    return { ok: true, runId, sessionId }
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function waitForRun(conn: EngineConnection, engineAgentId: string, runId: string, timing: Timing): Promise<EngineRunDetail> {
    const deadline = Date.now() + timing.waitMs
    let run = await getRun(conn, engineAgentId, runId)
    while (run.status === 'running' && Date.now() < deadline) {
        await sleep(timing.pollMs)
        run = await getRun(conn, engineAgentId, runId)
    }
    return run
}

export function failureOfRun(run: Pick<EngineRunDetail, 'status' | 'error' | 'output'>): TurnFailure | null {
    if (run.status === 'running') return 'timeout'
    if (run.status === 'done' && run.output?.trim()) return null
    const kind = classifyChatError(run.error ?? '')
    if (kind === 'unauthorized' || kind === 'usage_limit' || kind === 'budget' || /no (ai )?(model|provider|connection)|not connected|no usable model/i.test(run.error ?? '')) return 'no_model'
    return 'failed'
}

type Timing = { waitMs: number; pollMs: number; busyDelays: readonly number[] }
const DEFAULT_TIMING: Timing = { waitMs: RUN_WAIT_MS, pollMs: RUN_POLL_MS, busyDelays: BUSY_RETRY_DELAYS_MS }

export type AnswerRequest = { turn: ChannelAgentTurn; person: ChannelPerson; trigger: ChannelMessage; replyParentId: string | null }

async function rememberSession(scope: WorkScope, channelId: string, agentId: string, engineSessionId: string): Promise<void> {
    const { error } = await clientOf(scope)
        .from('channel_agent_sessions')
        .upsert<Database['public']['Tables']['channel_agent_sessions']['Insert']>({ channel_id: channelId, agent_id: agentId, workspace_id: scope.workspaceId, engine_session_id: engineSessionId }, { onConflict: 'channel_id,agent_id' })
    if (error) console.error('[channels] failed to remember the coworker conversation', error.message)
}

async function forgetSession(scope: WorkScope, channelId: string, agentId: string): Promise<void> {
    await clientOf(scope).from('channel_agent_sessions').delete().eq('channel_id', channelId).eq('agent_id', agentId).eq('workspace_id', scope.workspaceId)
}

// Asks the coworker of a claimed turn, waits for its run and posts what it says. Never throws: what
// goes wrong closes the turn with the reason the thread shows.
export async function answerAsCoworker(scope: WorkScope, request: AnswerRequest, timing: Timing = DEFAULT_TIMING): Promise<void> {
    const { turn, person, trigger } = request
    try {
        const supabase = clientOf(scope)
        const { data: agent } = await selectMaybeSingle(supabase, 'agents', ['id', 'name', 'engine_agent_id', 'disabled_at'] as const, { id: turn.agentId, workspace_id: scope.workspaceId })
        if (!agent) return failTurn(scope, turn.id, 'failed')
        if (agent.disabled_at) return failTurn(scope, turn.id, 'coworker_disabled')
        if (!agent.engine_agent_id) return failTurn(scope, turn.id, 'failed')
        const engine = await findWorkspaceEngine(scope.workspaceId)
        if (!engine) return failTurn(scope, turn.id, 'engine_unreachable')

        const [channel, context, callableAgentIds, { data: known }] = await Promise.all([
            getChannel(scope, turn.channelId),
            contextFor(scope, turn.channelId, trigger),
            callableEngineAgentIds(person),
            selectMaybeSingle(supabase, 'channel_agent_sessions', ['engine_session_id'] as const, { channel_id: turn.channelId, agent_id: turn.agentId }),
        ])
        const names = await namesFor(scope, [...context, trigger])
        const message = coworkerPrompt({ channelName: channel.name, channelKind: channel.kind, agentId: turn.agentId, trigger, context, inThread: !!trigger.parentMessageId }, names)
        const params = { message, source: 'channel' as const, author: { id: person.userId, name: names.personName(person.userId).slice(0, 80) }, callableAgentIds }

        let sent = await sendToEngine(engine.conn, agent.engine_agent_id, { ...params, sessionId: known?.engine_session_id ?? undefined }, timing.busyDelays)
        if (!sent.ok && sent.sessionGone) {
            await forgetSession(scope, turn.channelId, turn.agentId)
            sent = await sendToEngine(engine.conn, agent.engine_agent_id, params, timing.busyDelays)
        }
        if (!sent.ok) return failTurn(scope, turn.id, sent.failure)

        await recordTurnRun(scope, turn.id, sent.runId)
        if (sent.sessionId) {
            await rememberSession(scope, turn.channelId, turn.agentId, sent.sessionId)
            if (!known?.engine_session_id) await ensureSessionRow(turn.agentId, sent.sessionId, channel.kind === 'dm' ? 'Direct message' : `#${channel.name}`, { source: 'channel', status: 'working' })
        }

        const run = await waitForRun(engine.conn, agent.engine_agent_id, sent.runId, timing)
        const failure = failureOfRun(run)
        if (failure) return failTurn(scope, turn.id, failure)

        const reply = await postChannelMessage(scope, { kind: 'agent', agentId: turn.agentId }, turn.channelId, { body: (run.output ?? '').trim().slice(0, 40_000), parentMessageId: request.replyParentId })
        await finishTurn(scope, turn.id, { status: 'answered', reply_message_id: reply.id })
    } catch (err) {
        console.error('[channels] the coworker could not answer', { turn: turn.id, err: String(err) })
        await failTurn(scope, turn.id, err instanceof EngineUnreachableError ? 'engine_unreachable' : 'failed')
    }
}

async function recordTurnRun(scope: WorkScope, turnId: string, runId: string): Promise<void> {
    await clientOf(scope).from('channel_agent_turns').update<TurnUpdate>({ engine_run_id: runId }).eq('id', turnId).eq('workspace_id', scope.workspaceId)
}

// Claims a turn for each coworker the person may summon and asks them all, side by side. A coworker
// they cannot reach through its Box, or that is not in the channel, gets a failed turn instead, so
// the thread says why nobody answers.
export async function summonCoworkers(scope: WorkScope, person: ChannelPerson, message: ChannelMessage, agentIds: string[], timing: Timing = DEFAULT_TIMING): Promise<void> {
    if (agentIds.length === 0) return
    const channel = await getChannel(scope, message.channelId)
    const members = await agentMembersOf(scope, message.channelId)
    const placement = answerPlacement(channel.kind, message)
    await Promise.all(
        agentIds.map(async agentId => {
            const request = { channelId: message.channelId, agentId, threadMessageId: placement.threadMessageId, triggerMessageId: message.id, requestedBy: person.userId }
            if (!members.has(agentId)) return void (await claimTurn(scope, request, { status: 'failed', failure: 'not_member' }))
            if ((await readAgentAccess(person, agentId)) === 'none') return void (await claimTurn(scope, request, { status: 'failed', failure: 'no_access' }))
            const turn = await claimTurn(scope, request)
            if (!turn) return
            await answerAsCoworker(scope, { turn, person, trigger: message, replyParentId: placement.replyParentId }, timing)
        }),
    )
}

// What a freshly posted message sets off: the coworkers it summons answer once the response is
// sent, so posting stays instant. Hands back the coworkers it mentions that are not in the channel.
export async function reactToChannelMessage(scope: WorkScope, person: ChannelPerson, message: ChannelMessage): Promise<Summons> {
    const channel = await getChannel(scope, message.channelId)
    const [agentMembers, thread] = await Promise.all([agentMembersOf(scope, message.channelId), message.parentMessageId ? listThread(scope, message.channelId, message.parentMessageId) : Promise.resolve(null)])
    const summons = coworkersSummoned({ channelKind: channel.kind, message, agentMembers, thread })
    if (summons.agentIds.length > 0) runAfterResponse(() => summonCoworkers(scope, person, message, summons.agentIds))
    return summons
}

export function runAfterResponse(task: () => Promise<unknown>): void {
    const guarded = () => task().catch(err => console.error('[channels] coworker follow-up failed', err))
    try {
        after(guarded)
    } catch {
        void guarded()
    }
}

export function isSummonable(message: ChannelMessage, agentId: string): boolean {
    return message.author.kind === 'user' && !message.deletedAt && message.mentions.some(ref => sameMember(ref, { kind: 'agent', agentId }))
}

