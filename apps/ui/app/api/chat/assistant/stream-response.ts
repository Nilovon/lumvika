// The engine's UI message stream, piped through as it comes.
export function assistantStreamResponse(engineRes: Response, runId: string | null): Response {
    const headers = new Headers()
    headers.set('Content-Type', engineRes.headers.get('content-type') ?? 'text/event-stream')
    headers.set('x-vercel-ai-ui-message-stream', engineRes.headers.get('x-vercel-ai-ui-message-stream') ?? 'v1')
    if (runId) headers.set('X-Run-Id', runId)
    return new Response(engineRes.body, { headers })
}
