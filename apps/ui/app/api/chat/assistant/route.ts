import { ASSISTANT_AGENT_ID, ENGINE_SESSION_NOT_FOUND, SESSION_NOT_FOUND } from '@lumvika/contracts'
import { after } from 'next/server'

import { actorFromContext, type Actor } from '@/app/api/_auth/access'
import { requireWorkspaceContext, type WorkspaceContext } from '@/app/api/_auth/ownership'
import { assistantEngineOf, cancelAssistantRuns, eraseAssistantTranscript, sendAssistantTurn } from '@/app/api/_services/assistant-engine.service'
import { messageAuthorOf } from '@/app/api/_services/me.service'
import { getOwnAssistantChat, projectContextOf, recordAssistantTurn, requestAssistantStop, stopRequestedSince, titleAssistantChat } from '@/app/api/_services/work/assistant-chats.service'
import type { AssistantChatRow } from '@/app/api/_services/work/columns'
import { reconnectRun } from '@/lib/engine/client'
import { AppError } from '@/lib/i18n/action-error'
import { assistantStreamResponse } from '@/app/api/chat/assistant/stream-response'

// The plain Chat on the workspace engine. The chat row is the hub's and says whose conversation it
// is; the transcript, the model call and the stream are the engine's assistant. Only the owner of a
// chat writes in it: a shared chat is read-only for everyone else, and someone else's private chat
// answers as if it did not exist. The engine key never leaves the server.

type AssistantBody = { chatId?: unknown; text?: unknown; connectionId?: unknown; model?: unknown; queued?: unknown }

type Caller = { ctx: WorkspaceContext; actor: Actor; scope: { workspaceId: number } }

const json = (error: string, status: number, extra: Record<string, unknown> = {}) => Response.json({ error, ...extra }, { status })

async function authorize(): Promise<Caller | Response> {
    let ctx: WorkspaceContext
    try {
        ctx = await requireWorkspaceContext()
    } catch {
        return json('Unauthorized', 401)
    }
    if (ctx.authUser.is_anonymous) return json('Unauthorized', 401)
    return { ctx, actor: actorFromContext(ctx), scope: { workspaceId: ctx.workspace.id } }
}

async function ownChat(caller: Caller, chatId: string): Promise<AssistantChatRow | Response> {
    try {
        return await getOwnAssistantChat(caller.scope, caller.actor, chatId)
    } catch (err) {
        if (err instanceof AppError) return json(err.code, err.code === 'assistantChatReadOnly' ? 403 : 404)
        throw err
    }
}

const optionalString = (value: unknown) => (typeof value === 'string' && value ? value : undefined)

export async function POST(req: Request): Promise<Response> {
    const caller = await authorize()
    if (caller instanceof Response) return caller

    let body: AssistantBody
    try {
        body = (await req.json()) as AssistantBody
    } catch {
        return json('Invalid request body', 400)
    }
    const chatId = typeof body.chatId === 'string' ? body.chatId : ''
    const text = typeof body.text === 'string' ? body.text.trim() : ''
    if (!chatId || !text) return json('Missing chat id or message', 400)

    const row = await ownChat(caller, chatId)
    if (row instanceof Response) return row

    const conn = await assistantEngineOf(caller.scope.workspaceId)
    if (!conn) return json('no_engine', 409)

    const model = optionalString(body.model)
    const queued = body.queued === true
    const turnStartedAt = new Date().toISOString()
    let engineRes: Response
    let send: (engineSessionId: string | null, queuedTurn: boolean) => Promise<Response>
    try {
        const project = await projectContextOf(caller.scope, caller.actor, row)
        send = (engineSessionId, queuedTurn) =>
            sendAssistantTurn(conn, {
                engineSessionId,
                text,
                connectionId: optionalString(body.connectionId),
                model,
                author: messageAuthorOf(caller.ctx),
                brief: project ? { project } : {},
                queued: queuedTurn,
            })
        engineRes = await send(row.engine_session_id, queued)
    } catch {
        return json('engine_unreachable', 502)
    }

    if (engineRes.status === 409) {
        const busy = (await engineRes.json().catch(() => null)) as { runId?: string; startedAt?: string | null } | null
        const busyResponse = () => json('run_in_flight', 409, { runId: busy?.runId ?? null, startedAt: busy?.startedAt ?? null })
        if (queued || !busy?.runId) return busyResponse()
        const tail = await reconnectRun(conn, ASSISTANT_AGENT_ID, busy.runId).catch(() => null)
        if (!tail || tail.status === 204 || !tail.ok || !tail.body) return busyResponse()
        return assistantStreamResponse(tail, busy.runId)
    }
    if (!engineRes.ok || !engineRes.body) {
        const errBody = await engineRes.text().catch(() => '')
        // The chat names a conversation the engine no longer holds (a server restored from an older
        // backup): the client offers a new chat rather than a raw error.
        if (engineRes.status === 404 && errBody.includes(ENGINE_SESSION_NOT_FOUND)) return json(SESSION_NOT_FOUND, 404)
        // An engine that predates the assistant has no such agent.
        if (engineRes.status === 404) return json('engine_outdated', 409)
        return json(`Engine error: ${engineRes.status} ${errBody}`, 502)
    }

    const engineSessionId = engineRes.headers.get('x-session-id')
    let boundSessionId: string | null
    try {
        boundSessionId = (await recordAssistantTurn(caller.scope, row, { engineSessionId, model })).engineSessionId
    } catch {
        void engineRes.body.cancel().catch(() => {})
        return json('Failed to persist the chat', 500)
    }

    // Two first sends raced and the other one named the chat's conversation: this turn's engine
    // conversation is dropped and erased, and the message goes to the chat's own conversation, after
    // the answer running there.
    if (engineSessionId && boundSessionId && boundSessionId !== engineSessionId) {
        void engineRes.body.cancel().catch(() => {})
        const orphan = engineSessionId
        after(async () => {
            await cancelAssistantRuns(conn, orphan).catch(() => {})
            await eraseAssistantTranscript(conn, orphan)
        })
        try {
            engineRes = await send(boundSessionId, true)
        } catch {
            return json('engine_unreachable', 502)
        }
        if (engineRes.status === 409) return json('run_in_flight', 409, { runId: null, startedAt: null })
        if (!engineRes.ok || !engineRes.body) return json(`Engine error: ${engineRes.status}`, 502)
    }

    // Stop pressed before this turn could name its conversation stops its run now.
    if (boundSessionId && (await stopRequestedSince(caller.scope, row.id, turnStartedAt))) await cancelAssistantRuns(conn, boundSessionId).catch(() => {})
    if (!row.engine_session_id) after(() => titleAssistantChat(caller.scope, row, text).catch(() => null))

    return assistantStreamResponse(engineRes, engineRes.headers.get('x-run-id'))
}

// Stop. Closing the stream alone would leave the run going on the engine, still spending credit. On a
// chat whose first turn has not named its conversation yet, the stop is kept on the row and that turn
// applies it as soon as it does.
export async function DELETE(req: Request): Promise<Response> {
    const caller = await authorize()
    if (caller instanceof Response) return caller
    const chatId = new URL(req.url).searchParams.get('chatId')
    if (!chatId) return json('Missing chat id', 400)

    const row = await ownChat(caller, chatId)
    if (row instanceof Response) return row
    const engineSessionId = row.engine_session_id ?? (await requestAssistantStop(caller.scope, row))
    if (!engineSessionId) return Response.json({ ok: true })

    const conn = await assistantEngineOf(caller.scope.workspaceId)
    if (!conn) return json('no_engine', 409)
    try {
        await cancelAssistantRuns(conn, engineSessionId)
    } catch {
        return json('engine_unreachable', 502)
    }
    return Response.json({ ok: true })
}
