import { actorFromContext } from '@/app/api/_auth/access'
import { requireWorkspaceContext } from '@/app/api/_auth/ownership'
import { assistantEngineOf, tailAssistantRun } from '@/app/api/_services/assistant-engine.service'
import { getAssistantChat } from '@/app/api/_services/work/assistant-chats.service'
import { assistantStreamResponse } from '@/app/api/chat/assistant/stream-response'

// The run in flight on a chat, replayed for a tab that reloaded or lost its stream. Named by the chat,
// never by a run id from the browser: the run is looked up on the conversation the caller may read.
// 204 whenever there is nothing to follow, which the AI SDK reads as "no stream to resume".
export async function GET(req: Request): Promise<Response> {
    const none = () => new Response(null, { status: 204 })
    const chatId = new URL(req.url).searchParams.get('chatId')
    if (!chatId) return none()
    try {
        const ctx = await requireWorkspaceContext()
        if (ctx.authUser.is_anonymous) return none()
        const { row } = await getAssistantChat({ workspaceId: ctx.workspace.id }, actorFromContext(ctx), chatId)
        if (!row.engine_session_id) return none()
        const conn = await assistantEngineOf(ctx.workspace.id)
        if (!conn) return none()
        const tail = await tailAssistantRun(conn, row.engine_session_id)
        return tail ? assistantStreamResponse(tail.res, tail.runId) : none()
    } catch {
        return none()
    }
}
