import { resolveRunTarget } from '@/app/api/_services/chat.service'
import { reconnectRun } from '@/lib/engine/client'

export async function GET(request: Request) {
    const url = new URL(request.url)
    const runId = url.searchParams.get('runId')
    const agentId = url.searchParams.get('agentId')

    if (!runId || !agentId) {
        return new Response(null, { status: 204 })
    }

    const target = await resolveRunTarget(agentId).catch(() => null)
    if (!target) {
        return new Response(null, { status: 204 })
    }

    let engineRes: Response
    try {
        engineRes = await reconnectRun(target.conn, target.engineAgentId, runId)
    } catch {
        return new Response(null, { status: 204 })
    }

    if (engineRes.status === 204 || !engineRes.ok || !engineRes.body) {
        return new Response(null, { status: 204 })
    }

    const headers = new Headers()
    headers.set('Content-Type', engineRes.headers.get('content-type') ?? 'text/event-stream')
    headers.set('x-vercel-ai-ui-message-stream', engineRes.headers.get('x-vercel-ai-ui-message-stream') ?? 'v1')

    return new Response(engineRes.body, { headers })
}
