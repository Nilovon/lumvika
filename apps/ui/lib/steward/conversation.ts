import 'server-only'

import { STEWARD_AGENT_ID } from '@lumvika/contracts'
import type { UIMessage } from 'ai'

import type { WorkspaceContext } from '@/app/api/_auth/ownership'
import { lastRunError, listSessionRuns, readUsageSeed, type SessionUsageSeed } from '@/app/api/_services/chat.service'
import { getWorkspaceConnection } from '@/app/api/_services/workspace-engine.service'
import type { Database } from '@/app/api/database.types'
import { generateSessionTitle } from '@/lib/ai/generate-title'
import { transformEngineMessages } from '@/lib/chat/engine-history'
import { cancelRun, getSessionMessages, listRuns } from '@/lib/engine/client'
import type { EngineConnection } from '@/lib/engine/types'
import type { StewardBackend } from './phase'
import { stripAttachmentsRef } from '@/lib/chat/attachments-marker'
import { dedupeMessagesById } from '@/lib/steward/dedupe-messages'
import { isKickoffText } from '@/lib/steward/kickoff-marker'
import { stripVoiceMarker } from '@/lib/voice/marker'
import { insertRows, selectMany, selectMaybeSingle, serviceScope, updateRows } from '@/lib/db'

// One row per conversation. A hub conversation is rewritten whole at the end of each turn: onFinish
// hands back the updated UIMessage list, and replacing it is both simpler and more faithful than
// diffing parts that the SDK may have merged. An engine conversation keeps its transcript on the
// engine, and its row only says whose it is and where to read it.

// What only an engine conversation has: its runs live on the engine, so the gauge, the failure of a
// run that died without answering and the run still in flight are read back with the transcript.
export type StewardRunState = { usage: SessionUsageSeed | null; lastError: string | null; activeRunId: string | null }

export type StewardConversation = { sessionId: string; title: string | null; backend: StewardBackend; messages: UIMessage[] } & StewardRunState

const NO_RUN_STATE: StewardRunState = { usage: null, lastError: null, activeRunId: null }

const CONVERSATION_COLUMNS = ['id', 'title', 'messages', 'backend', 'engine_session_id'] as const

type ConversationUpdate = Database['public']['Tables']['steward_conversations']['Update']

const UNIQUE_VIOLATION = '23505'

function firstUserText(messages: UIMessage[]): string {
    // The message that starts a guided setup was written by the app, not by the user: naming the
    // conversation after it would put the marker itself in the sidebar.
    const first = messages.find(message => message.role === 'user' && !message.parts.some(part => part.type === 'text' && isKickoffText((part as { text: string }).text)))
    if (!first) return ''
    // Un vocal porte son audio comme marqueur collé au transcript, et une pièce jointe sa liste de
    // chemins : la conversation est nommée d'après ce qui a été dit, pas d'après le fichier.
    return stripVoiceMarker(
        stripAttachmentsRef(
            first.parts
                .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
                .map(part => part.text)
                .join(' ')
                .trim()
        )
    )
}

// Les tours écrits avant que la route ne nomme sa réponse ont été persistés avec un id vide, et
// deux d'entre eux dans la même conversation se rendent sous la même clé. Comblé à la lecture
// plutôt que par une migration : l'id ne sert qu'à la pile du navigateur, et sa position dans le
// transcript en fait une clé stable d'un rechargement à l'autre.
function withMessageIds(sessionId: string, messages: UIMessage[]): UIMessage[] {
    return messages.map((message, index) => (message.id ? message : { ...message, id: `${sessionId}-${index}` }))
}

// The last conversation this person had with the steward their workspace talks to now: the
// onboarding's on the hub, the everyday one on the engine. The onboarding's never comes back once the
// engine has taken over. A workspace with no conversation yet gets none back: the client opens on an
// empty column and names the session itself.
export async function loadStewardConversation(ctx: WorkspaceContext, backend: StewardBackend): Promise<StewardConversation | null> {
    const scope = serviceScope()
    const { data: rows } = await selectMany(scope, 'steward_conversations', CONVERSATION_COLUMNS, { workspace_id: ctx.workspace.id, user_id: ctx.userId, backend }, { column: 'updated_at', ascending: false }, 1)
    const data = rows?.[0]
    if (!data) return null

    if (backend === 'engine') {
        if (!data.engine_session_id) return { sessionId: data.id, title: data.title, backend, messages: [], ...NO_RUN_STATE }
        const conn = await getWorkspaceConnection(ctx.workspace.id)
        // Each part fails on its own: a transcript with no gauge beats no transcript at all, and an
        // engine that predates the steward's run routes answers 403 to the second read.
        const [messages, runState] = await Promise.all([readEngineTranscript(conn, data.engine_session_id), readRunState(conn, data.engine_session_id).catch(() => NO_RUN_STATE)])
        return { sessionId: data.id, title: data.title, backend, messages, ...runState }
    }
    return { sessionId: data.id, title: data.title, backend, messages: withMessageIds(data.id, dedupeMessagesById((data.messages ?? []) as unknown as UIMessage[])), ...NO_RUN_STATE }
}

async function readEngineTranscript(conn: EngineConnection, engineSessionId: string): Promise<UIMessage[]> {
    return transformEngineMessages(await getSessionMessages(conn, STEWARD_AGENT_ID, engineSessionId)) as UIMessage[]
}

async function readRunState(conn: EngineConnection, engineSessionId: string): Promise<StewardRunState> {
    const runs = await listSessionRuns(conn, STEWARD_AGENT_ID, engineSessionId)
    const usage = runs.lastDone ? await readUsageSeed(conn, STEWARD_AGENT_ID, runs.lastDone).catch(() => null) : null
    return { usage, lastError: lastRunError(runs.latest), activeRunId: runs.running?.id ?? null }
}

// The transcript of one engine conversation of the caller, for a column that needs to read it again
// once a run it was following is over.
export async function readStewardEngineMessages(ctx: WorkspaceContext, sessionId: string): Promise<UIMessage[]> {
    const session = await engineSessionOf(ctx, sessionId)
    if (session?.backend !== 'engine' || !session.engineSessionId) return []
    return readEngineTranscript(await getWorkspaceConnection(ctx.workspace.id), session.engineSessionId)
}

// Stop covers the whole conversation, not just the run this tab happens to be streaming: after a
// reload the column no longer holds the id of the run it is looking at.
export async function cancelStewardSessionRuns(ctx: WorkspaceContext, sessionId: string): Promise<void> {
    const session = await engineSessionOf(ctx, sessionId)
    if (session?.backend !== 'engine' || !session.engineSessionId) return
    const { engineSessionId } = session
    const conn = await getWorkspaceConnection(ctx.workspace.id)
    const runs = await listRuns(conn, STEWARD_AGENT_ID, { sessionId: engineSessionId, status: 'running', limit: 200 })
    await Promise.all(runs.filter(run => run.sessionId === engineSessionId && run.status === 'running').map(run => cancelRun(conn, STEWARD_AGENT_ID, run.id).catch(() => {})))
}

// The engine session a conversation continues, or null for one that has not started yet. A row that
// exists on the hub side cannot be continued on the engine: it answers 'hub'.
export async function engineSessionOf(ctx: WorkspaceContext, sessionId: string): Promise<{ backend: StewardBackend; engineSessionId: string | null } | null> {
    const scope = serviceScope()
    const { data } = await selectMaybeSingle(scope, 'steward_conversations', ['backend', 'engine_session_id'] as const, { id: sessionId, workspace_id: ctx.workspace.id, user_id: ctx.userId })
    if (!data) return null
    return { backend: data.backend === 'engine' ? 'engine' : 'hub', engineSessionId: data.engine_session_id }
}

export async function startEngineConversation(ctx: WorkspaceContext, sessionId: string, engineSessionId: string, firstText: string): Promise<void> {
    const scope = serviceScope()
    const { error } = await insertRows(scope, 'steward_conversations', {
        id: sessionId,
        workspace_id: ctx.workspace.id,
        user_id: ctx.userId,
        backend: 'engine',
        engine_session_id: engineSessionId,
    })
    if (error) throw new Error(error.message)

    // Not awaited: the stream is waiting on this row, not on its title.
    const seed = stripVoiceMarker(stripAttachmentsRef(firstText)).trim()
    if (!seed) return
    void generateSessionTitle(seed)
        .then(async title => {
            if (title) await updateRows(scope, 'steward_conversations', { title }, { id: sessionId })
        })
        .catch(() => {})
}

// What "reopen my last conversation" sorts on, so it has to move on every turn.
export async function touchStewardConversation(sessionId: string): Promise<void> {
    const scope = serviceScope()
    await updateRows(scope, 'steward_conversations', { updated_at: new Date().toISOString() }, { id: sessionId })
}

export async function saveStewardConversation(ctx: WorkspaceContext, sessionId: string, messages: UIMessage[]): Promise<void> {
    const scope = serviceScope()
    const { data: existing } = await selectMaybeSingle(scope, 'steward_conversations', ['id', 'title'] as const, { id: sessionId, workspace_id: ctx.workspace.id, user_id: ctx.userId })

    const payload = messages as unknown as ConversationUpdate['messages']

    if (!existing) {
        const { error } = await insertRows(scope, 'steward_conversations', {
            id: sessionId,
            workspace_id: ctx.workspace.id,
            user_id: ctx.userId,
            messages: payload,
        })
        // Two requests of the same conversation finishing together both find no row and both insert.
        // The later one writes over the earlier, scoped to its owner: the id comes from the browser.
        if (error?.code === UNIQUE_VIOLATION) {
            const { error: updateError } = await updateRows(scope, 'steward_conversations', { messages: payload, updated_at: new Date().toISOString() }, { id: sessionId, workspace_id: ctx.workspace.id, user_id: ctx.userId })
            if (updateError) throw new Error(updateError.message)
        } else if (error) throw new Error(error.message)
    } else {
        const { error } = await updateRows(scope, 'steward_conversations', { messages: payload, updated_at: new Date().toISOString() }, { id: sessionId })
        if (error) throw new Error(error.message)
    }

    if (existing?.title) return
    const seed = firstUserText(messages)
    if (!seed) return
    const title = await generateSessionTitle(seed).catch(() => null)
    if (!title) return
    await updateRows(scope, 'steward_conversations', { title }, { id: sessionId })
}
