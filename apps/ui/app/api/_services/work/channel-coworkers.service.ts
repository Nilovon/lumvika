import 'server-only'

import { classifyChatError, type ChannelKind, type ChannelMessage, type WorkMemberRef } from '@lumvika/contracts'
import { after } from 'next/server'

import { callableEngineAgentIds, readAgentAccess } from '@/app/api/_auth/access'
import type { Database } from '@/app/api/database.types'
import { resolveMemberIdentities } from '@/app/api/_services/members.service'
import { getChannel, getChannelMessage, listThread, postChannelMessage, type ChannelPerson } from '@/app/api/_services/work/channels.service'
import { CHANNEL_MESSAGE_COLUMNS } from '@/app/api/_services/work/columns'
import { toChannelMessage } from '@/app/api/_services/work/mappers'
import { clientOf, sameMember, type WorkScope } from '@/app/api/_services/work/refs'
import { findWorkspaceEngine } from '@/app/api/_services/workspace-engine.service'
import { QUEUED_RETRY_DELAYS_MS, startChat } from '@/lib/chat/start-chat'
import { EngineUnreachableError, getRun } from '@/lib/engine/client'
import type { EngineConnection, EngineRunDetail } from '@/lib/engine/types'
import { selectAll, selectMany, selectMaybeSingle, type TableRow } from '@/supabase/supabase-helpers'

// A coworker answering in a channel. A person's message summons the coworkers it mentions, the
// coworker of a direct message, and the coworkers already in the thread it replies to. After the
// response the hub asks each one through the same engine `/chat` a person's chat uses (source
// `channel`, one engine conversation per coworker and channel) and stores the run on the turn; the
// engine's run-end webhook then posts the answer as the coworker (`finishChannelTurnForRun`). No
// request waits for a run. Every answer is a `channel_agent_turns` row everyone in the channel reads:
// "answering" while it runs, then answered, or failed with the reason the thread shows.

export const CHANNEL_AGENT_TURN_COLUMNS = ['id', 'channel_id', 'agent_id', 'thread_message_id', 'trigger_message_id', 'status', 'failure', 'reply_message_id', 'created_at', 'finished_at'] as const
export type ChannelAgentTurnRow = Pick<TableRow<'channel_agent_turns'>, (typeof CHANNEL_AGENT_TURN_COLUMNS)[number]>

export const TURN_FAILURES = ['engine_unreachable', 'engine_outdated', 'coworker_disabled', 'no_model', 'no_access', 'not_member', 'timeout', 'failed', 'needs_input', 'cancelled'] as const
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
// Past this, a turn still marked answering counts as timed out wherever it is read: its run never
// reported back. An answer that does arrive later still replaces the timeout.
export const STALE_TURN_MS = 15 * 60_000
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
    await closeStaleTurns(scope, request.channelId)

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

// No background job: a turn that outlived the limit is closed by the next read or post in its channel.
export async function closeStaleTurns(scope: WorkScope, channelId: string, now = Date.now()): Promise<void> {
    const { error } = await clientOf(scope)
        .from('channel_agent_turns')
        .update<TurnUpdate>({ status: 'failed', failure: 'timeout', finished_at: new Date(now).toISOString() })
        .eq('channel_id', channelId)
        .eq('workspace_id', scope.workspaceId)
        .eq('status', 'answering')
        .lt('created_at', new Date(now - STALE_TURN_MS).toISOString())
    if (error) console.error('[channels] failed to close the stale coworker turns', channelId, error.message)
}

export async function listChannelTurns(scope: WorkScope, channelId: string, limit = 200): Promise<ChannelAgentTurn[]> {
    await closeStaleTurns(scope, channelId)
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

type ChatOutcome = { ok: true; runId: string; sessionId: string | null } | { ok: false; failure: TurnFailure; sessionGone?: boolean; busy?: boolean }

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
        if (res.status === 409 && params.sessionId) return { ok: false, failure: 'failed', busy: true }
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

// What an engine without a model it can run says: no key for the Lumvika models
// ("Set OPENROUTER_API_KEY to run the Lumvika models, or connect another AI provider in the app.")
// or no provider connected at all.
const NO_USABLE_MODEL = /api_key|connect another ai provider|no (ai )?(model|provider|connection)|not connected|no usable model/i

export function failureOfRun(run: Pick<EngineRunDetail, 'status' | 'error' | 'output'>): TurnFailure | null {
    if (run.status === 'running') return 'timeout'
    if (run.status === 'cancelled') return 'cancelled'
    if (run.status === 'done' && run.output?.trim()) return null
    const kind = classifyChatError(run.error ?? '')
    if (kind === 'unauthorized' || kind === 'usage_limit' || kind === 'budget' || NO_USABLE_MODEL.test(run.error ?? '')) return 'no_model'
    return 'failed'
}

export type AnswerRequest = { turn: ChannelAgentTurn; person: ChannelPerson; trigger: ChannelMessage }

async function rememberSession(scope: WorkScope, channelId: string, agentId: string, engineSessionId: string): Promise<void> {
    const { error } = await clientOf(scope)
        .from('channel_agent_sessions')
        .upsert<Database['public']['Tables']['channel_agent_sessions']['Insert']>({ channel_id: channelId, agent_id: agentId, workspace_id: scope.workspaceId, engine_session_id: engineSessionId }, { onConflict: 'channel_id,agent_id' })
    if (error) console.error('[channels] failed to remember the coworker conversation', error.message)
}

async function forgetSession(scope: WorkScope, channelId: string, agentId: string): Promise<void> {
    await clientOf(scope).from('channel_agent_sessions').delete().eq('channel_id', channelId).eq('agent_id', agentId).eq('workspace_id', scope.workspaceId)
}

async function recordTurnRun(scope: WorkScope, turnId: string, runId: string): Promise<void> {
    const { error } = await clientOf(scope).from('channel_agent_turns').update<TurnUpdate>({ engine_run_id: runId }).eq('id', turnId).eq('workspace_id', scope.workspaceId)
    if (error) throw new Error(`Failed to record the coworker run: ${error.message}`)
}

// Starts the run of a claimed turn and returns: the answer arrives with the run-end webhook. Never
// throws: what goes wrong closes the turn with the reason the thread shows.
//
// A coworker still answering in another thread of the same channel holds its conversation: past a
// short wait, this turn runs in a conversation of its own rather than holding the request.
export async function startCoworkerTurn(scope: WorkScope, request: AnswerRequest, busyDelays: readonly number[] = QUEUED_RETRY_DELAYS_MS): Promise<void> {
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

        let sent = await sendToEngine(engine.conn, agent.engine_agent_id, { ...params, sessionId: known?.engine_session_id ?? undefined }, busyDelays)
        const ownConversation = !sent.ok && sent.busy
        if (!sent.ok && sent.sessionGone) await forgetSession(scope, turn.channelId, turn.agentId)
        if (!sent.ok && (sent.sessionGone || sent.busy)) sent = await sendToEngine(engine.conn, agent.engine_agent_id, params, busyDelays)
        if (!sent.ok) return failTurn(scope, turn.id, sent.failure)

        await recordTurnRun(scope, turn.id, sent.runId)
        // The conversation stays the channel's: no `sessions` row mirrors it, since everyone who uses
        // the coworker's Box reads those, members of the channel or not.
        if (sent.sessionId && !ownConversation) await rememberSession(scope, turn.channelId, turn.agentId, sent.sessionId)

        // A run that already ended may have reported it before its id was stored on the turn.
        const run = await getRun(engine.conn, agent.engine_agent_id, sent.runId).catch(() => null)
        if (run && run.status !== 'running') await finishChannelTurnForRun(scope, { runId: sent.runId, ending: run.status === 'cancelled' ? 'cancelled' : run.status === 'error' ? 'error' : 'done' })
    } catch (err) {
        console.error('[channels] the coworker could not answer', { turn: turn.id, err: String(err) })
        await failTurn(scope, turn.id, err instanceof EngineUnreachableError ? 'engine_unreachable' : 'failed')
    }
}

// How a run reported by the engine ended, as far as a channel turn cares.
export type ChannelRunEnding = { runId: string; ending: 'done' | 'error' | 'cancelled' | 'needs_input' }

type EngineEvent = { event: string; kind: string; runId?: string | null; source?: string | null; metadata?: Record<string, unknown> | null }

const PAUSE_KINDS = new Set(['question', 'approval', 'connector'])

// What an engine webhook says about the end of a run. A run that stops on a question or an approval
// for the person sends no terminal event, only that notification: for a channel turn it is an end
// too. The engine reports no source for a chat run (`channel` included), so the run id alone is what
// matches the turn, on any engine version; without one there is nothing to match.
export function channelRunEndingOf(payload: EngineEvent): ChannelRunEnding | null {
    if (!payload.runId) return null
    if (payload.event === 'agent.notification') return PAUSE_KINDS.has(payload.kind) ? { runId: payload.runId, ending: 'needs_input' } : null
    if (!payload.event.endsWith('.completed')) return null
    if (payload.metadata?.status === 'cancelled') return { runId: payload.runId, ending: 'cancelled' }
    return { runId: payload.runId, ending: payload.kind === 'error' ? 'error' : 'done' }
}

type Closing = { status: 'answered' | 'failed'; failure: TurnFailure | null; body: string | null }

function closingOf(ending: ChannelRunEnding['ending'], run: Pick<EngineRunDetail, 'status' | 'error' | 'output'> | null): Closing {
    const said = run?.output?.trim() || null
    if (ending === 'needs_input') return { status: 'failed', failure: 'needs_input', body: said }
    if (ending === 'cancelled') return { status: 'failed', failure: 'cancelled', body: null }
    if (!run) return { status: 'failed', failure: 'failed', body: null }
    const failure = failureOfRun(run.status === 'running' ? { ...run, status: ending === 'error' ? 'error' : 'done' } : run)
    return failure ? { status: 'failed', failure, body: null } : { status: 'answered', failure: null, body: said }
}

// Closes the turn of a run that ended and posts what the coworker said, once: the webhook may come
// twice, and the turn's own start may race it. Only the call that moves the turn out of answering
// (or out of a timeout, for an answer that came late) posts. Answers which happened, for the tests.
export async function finishChannelTurnForRun(scope: WorkScope, report: ChannelRunEnding): Promise<'none' | 'already' | 'answered' | 'failed'> {
    const supabase = clientOf(scope)
    const { data: turn } = await selectMaybeSingle(supabase, 'channel_agent_turns', [...CHANNEL_AGENT_TURN_COLUMNS, 'engine_run_id'] as const, { workspace_id: scope.workspaceId, engine_run_id: report.runId })
    if (!turn) return 'none'
    if (turn.status !== 'answering' && !(turn.status === 'failed' && turn.failure === 'timeout')) return 'already'

    const [{ data: agent }, engine] = await Promise.all([selectMaybeSingle(supabase, 'agents', ['engine_agent_id'] as const, { id: turn.agent_id, workspace_id: scope.workspaceId }), findWorkspaceEngine(scope.workspaceId)])
    const run = agent?.engine_agent_id && engine ? await getRun(engine.conn, agent.engine_agent_id, report.runId).catch(() => null) : null
    const closing = closingOf(report.ending, run)

    const { data: claimed, error } = await supabase
        .from('channel_agent_turns')
        .update<TurnUpdate>({ status: closing.status, failure: closing.failure, finished_at: new Date().toISOString() })
        .eq('id', turn.id)
        .eq('workspace_id', scope.workspaceId)
        .or('status.eq.answering,failure.eq.timeout')
        .select('id')
    if (error) throw new Error(`Failed to close the coworker turn: ${error.message}`)
    if (!claimed || claimed.length === 0) return 'already'
    if (!closing.body) return closing.status

    const [channel, trigger] = await Promise.all([getChannel(scope, turn.channel_id), getChannelMessage(scope, turn.trigger_message_id)])
    const reply = await postChannelMessage(scope, { kind: 'agent', agentId: turn.agent_id }, turn.channel_id, { body: closing.body.slice(0, 40_000), parentMessageId: answerPlacement(channel.kind, trigger).replyParentId })
    await clientOf(scope).from('channel_agent_turns').update<TurnUpdate>({ reply_message_id: reply.id }).eq('id', turn.id).eq('workspace_id', scope.workspaceId)
    return closing.status
}

// Claims a turn for each coworker the person may summon and asks them all, side by side. A coworker
// they cannot reach through its Box, or that is not in the channel, gets a failed turn instead, so
// the thread says why nobody answers.
export async function summonCoworkers(scope: WorkScope, person: ChannelPerson, message: ChannelMessage, agentIds: string[], busyDelays: readonly number[] = QUEUED_RETRY_DELAYS_MS): Promise<void> {
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
            await startCoworkerTurn(scope, { turn, person, trigger: message }, busyDelays)
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

