import 'server-only'

import { ASSISTANT_AGENT_ID, ENGINE_CAPABILITY_ASSISTANT, ENGINE_CAPABILITY_ASSISTANT_SESSION_DELETE, type AssistantBrief, type MessageAuthor, type ReasoningEffort } from '@lumvika/contracts'
import type { UIMessage } from 'ai'

import { ADMIN_ONLY, AuthorizationError, requireWorkspaceContext } from '@/app/api/_auth/ownership'
import { lastRunError, listSessionRuns } from '@/app/api/_services/chat.service'
import type { TranscriptErasure } from '@/app/api/_services/work/assistant-chats.service'
import { findWorkspaceEngine, NoEngineError } from '@/app/api/_services/workspace-engine.service'
import { transformEngineMessages } from '@/lib/chat/engine-history'
import { QUEUED_RETRY_DELAYS_MS, startChat } from '@/lib/chat/start-chat'
import { cancelRun, deleteSession, getEngineHealth, getSessionMessages, listRuns, reconnectRun } from '@/lib/engine/client'
import type { EngineConnection } from '@/lib/engine/types'

// The workspace engine as the plain Chat sees it. The assistant is one engine agent for every member,
// so nothing here lists its conversations: each read names the one engine session the caller's chat
// row points to, and the routes check that row first.

export type AssistantAvailability = 'ready' | 'outdated' | 'no_engine' | 'unreachable'

export type AssistantRunState = { activeRunId: string | null; lastError: string | null }

type ChatParams = Parameters<typeof startChat>[2]

export async function assistantEngineOf(workspaceId: number): Promise<EngineConnection | null> {
    return (await findWorkspaceEngine(workspaceId))?.conn ?? null
}

// An engine updates on its own schedule: one that predates the assistant answers its health without
// the capability, and the screen says to update it instead of offering a composer that fails.
export async function assistantAvailability(workspaceId: number): Promise<{ availability: AssistantAvailability; conn: EngineConnection | null }> {
    const conn = await assistantEngineOf(workspaceId)
    if (!conn) return { availability: 'no_engine', conn: null }
    try {
        const health = await getEngineHealth(conn)
        return { availability: health.capabilities.includes(ENGINE_CAPABILITY_ASSISTANT) ? 'ready' : 'outdated', conn }
    } catch {
        return { availability: 'unreachable', conn }
    }
}

export async function readAssistantTranscript(conn: EngineConnection, engineSessionId: string): Promise<UIMessage[]> {
    return transformEngineMessages(await getSessionMessages(conn, ASSISTANT_AGENT_ID, engineSessionId)) as UIMessage[]
}

export async function readAssistantRunState(conn: EngineConnection, engineSessionId: string): Promise<AssistantRunState> {
    const runs = await listSessionRuns(conn, ASSISTANT_AGENT_ID, engineSessionId)
    return { activeRunId: runs.running?.id ?? null, lastError: lastRunError(runs.latest) }
}

// Stop covers the whole conversation: a tab reloaded mid-run does not hold the id of the run it shows.
export async function cancelAssistantRuns(conn: EngineConnection, engineSessionId: string): Promise<void> {
    const runs = await listRuns(conn, ASSISTANT_AGENT_ID, { sessionId: engineSessionId, status: 'running', limit: 200 })
    await Promise.all(runs.filter(run => run.sessionId === engineSessionId && run.status === 'running').map(run => cancelRun(conn, ASSISTANT_AGENT_ID, run.id).catch(() => {})))
}

// The run in flight on the conversation, replayed from its start, or null when nothing runs.
export async function tailAssistantRun(conn: EngineConnection, engineSessionId: string): Promise<{ runId: string; res: Response } | null> {
    const { activeRunId } = await readAssistantRunState(conn, engineSessionId)
    if (!activeRunId) return null
    const res = await reconnectRun(conn, ASSISTANT_AGENT_ID, activeRunId)
    if (res.status === 204 || !res.ok || !res.body) return null
    return { runId: activeRunId, res }
}

export type AssistantTurn = { engineSessionId: string | null; text: string; connectionId?: string; model?: string; effort?: ReasoningEffort; author: MessageAuthor; brief: AssistantBrief; queued: boolean }

export async function sendAssistantTurn(conn: EngineConnection, turn: AssistantTurn): Promise<Response> {
    // `assistant` rides beside the fields the client types: the engine reads it for this agent only.
    const params: ChatParams & { assistant: AssistantBrief } = {
        sessionId: turn.engineSessionId ?? undefined,
        message: turn.text,
        connectionId: turn.connectionId,
        model: turn.model,
        effort: turn.effort,
        source: 'dashboard',
        author: turn.author,
        assistant: turn.brief,
    }
    return startChat(conn, ASSISTANT_AGENT_ID, params, turn.queued ? QUEUED_RETRY_DELAYS_MS : null)
}

// The model picker of the Chat reads the assistant like a coworker's. Its default model is the whole
// workspace's, so only an admin sets it; picking one for a single chat stays open to everyone.
export async function resolveAssistantModelTarget(access: 'use' | 'manage'): Promise<{ conn: EngineConnection; engineAgentId: string; contentLocked: false }> {
    const ctx = await requireWorkspaceContext()
    if (ctx.authUser.isAnonymous) throw new AuthorizationError('coworkerNotFound')
    if (access === 'manage' && ctx.role !== 'admin') throw new AuthorizationError(ADMIN_ONLY)
    const conn = await assistantEngineOf(ctx.workspace.id)
    if (!conn) throw new NoEngineError()
    return { conn, engineAgentId: ASSISTANT_AGENT_ID, contentLocked: false }
}

// A run stopped a moment ago may still hold its conversation while it writes its last step: a few
// short tries cover that, without a queue to come back later.
export const ERASE_RETRY_DELAYS_MS = [300, 1_000, 2_000]

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// Erases the conversation on the engine: stops what still runs on it, then deletes it. An engine
// without the route keeps it ('outdated'); one that does not answer, or still holds it after the
// tries, too ('unreachable').
export async function eraseAssistantTranscript(conn: EngineConnection | null, engineSessionId: string, wait: (ms: number) => Promise<unknown> = pause): Promise<Exclude<TranscriptErasure, 'none'>> {
    if (!conn) return 'unreachable'
    try {
        const health = await getEngineHealth(conn)
        if (!health.capabilities.includes(ENGINE_CAPABILITY_ASSISTANT_SESSION_DELETE)) return 'outdated'
        await cancelAssistantRuns(conn, engineSessionId).catch(() => {})
        for (const delay of [0, ...ERASE_RETRY_DELAYS_MS]) {
            if (delay) await wait(delay)
            const res = await deleteSession(conn, ASSISTANT_AGENT_ID, engineSessionId)
            if (res.ok || res.status === 404) return 'erased'
            if (res.status !== 409) return 'unreachable'
        }
        return 'unreachable'
    } catch {
        return 'unreachable'
    }
}
