import { selectMaybeSingle, userScope } from '@/lib/db'
import { getRequestAuth } from '@/lib/auth/session/request'
import { BROADCAST_EVENTS } from '@/lib/live/protocol'
import { createBroadcastGuard } from '@/lib/live/server/broadcast-guard'
import { publishBroadcast } from '@/lib/live/server/runtime'
import { z } from 'zod'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MAX_PAYLOAD_BYTES = 1024

const broadcastBody = z.object({
    workspaceId: z.number().int().positive(),
    event: z.enum(BROADCAST_EVENTS),
    payload: z.record(z.string(), z.unknown()).default({}),
})

const guard = createBroadcastGuard({
    isMember: async (userId, workspaceId) => {
        const { data } = await selectMaybeSingle(userScope(userId), 'workspace_members', ['user_id'], { user_id: userId, workspace_id: workspaceId })
        return !!data
    },
})

// A message to the other members of a workspace who have the app open, never stored: the cursors of
// the board. The sender is the session's user, whatever the payload says.
export async function POST(request: Request) {
    const auth = await getRequestAuth()
    if (!auth) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const parsed = broadcastBody.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return Response.json({ error: 'Invalid broadcast' }, { status: 400 })
    const { workspaceId, event } = parsed.data
    const userId = auth.user.id
    const payload = { ...parsed.data.payload, userId }
    if (JSON.stringify(payload).length > MAX_PAYLOAD_BYTES) return Response.json({ error: 'Broadcast too large' }, { status: 413 })

    const verdict = await guard.check(userId, workspaceId)
    if (verdict === 'limited') return Response.json({ error: 'Too many broadcasts' }, { status: 429 })
    if (verdict === 'forbidden') return Response.json({ error: 'Forbidden' }, { status: 403 })

    await publishBroadcast({ workspace_id: workspaceId, from: userId, event, payload })
    return new Response(null, { status: 204 })
}
