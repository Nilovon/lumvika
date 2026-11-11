import { getRequestAuth } from '@/lib/auth/session/request'
import { liveHub, memberWorkspaces, publishBroadcast } from '@/lib/live/server/runtime'
import { LIVE_STREAM_HEADERS, openLiveStream } from '@/lib/live/server/stream'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MAX_LEAVE_WORKSPACES = 20

// The signed-in user's changes as server-sent events (protocol in lib/live/protocol.ts): their own
// rows, and those of every workspace they are a member of, each read again as them.
export async function GET(request: Request) {
    const auth = await getRequestAuth()
    if (!auth) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const userId = auth.user.id
    const workspaces = await memberWorkspaces(userId)
    if (!workspaces) return Response.json({ error: 'Unavailable' }, { status: 503 })

    const hub = liveHub()
    const stream = openLiveStream({
        hub,
        userId,
        workspaces,
        signal: request.signal,
        // A tab that went away takes its cursor off the boards of the others, unless another of the
        // user's tabs is still there. A stream at the end of its lifetime is opened again at once.
        onClose: ({ ended }, left) => {
            if (ended === 'lifetime' || hub.streamsOf(userId).size > 0) return
            for (const workspaceId of left.workspaces.slice(0, MAX_LEAVE_WORKSPACES)) {
                publishBroadcast({ workspace_id: workspaceId, from: userId, event: 'cursor-leave', payload: { userId } }).catch(() => undefined)
            }
        },
    })
    return new Response(stream.body, { headers: LIVE_STREAM_HEADERS })
}
