import { after } from 'next/server'

import { recordGettingStartedEvent } from '@/app/api/_services/getting-started.service'
import { followAuthorOfCreatedTask } from '@/app/api/_services/notification-audience.service'
import { recordNotification } from '@/app/api/_services/notification.service'
import { channelRunEndingOf, finishChannelTurnForRun } from '@/app/api/_services/work/channel-coworkers.service'
import { releaseRunCheckouts } from '@/app/api/_services/work/work-queue.service'
import { authenticateEngineToken } from '@/app/api/_services/workspace-engine.service'
import { engineCreatedEventSchema, notificationPayloadSchema } from '@/lib/engine/types'
import { isRunCompletion } from '@/lib/notifications/inbound'

export async function POST(req: Request) {
    const header = req.headers.get('authorization') ?? ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : ''
    if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const engine = await authenticateEngineToken(token)
    if (!engine) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    let body: unknown
    try {
        body = await req.json()
    } catch {
        return Response.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const created = engineCreatedEventSchema.safeParse(body)
    if (created.success) {
        await Promise.all([recordGettingStartedEvent(engine.workspaceId, created.data.event), followAuthorOfCreatedTask(engine.workspaceId, created.data)])
        return Response.json({ ok: true }, { status: 202 })
    }

    const parsed = notificationPayloadSchema.safeParse(body)
    if (!parsed.success) return Response.json({ error: 'Invalid payload' }, { status: 400 })

    // What a run's end sets off besides its notification runs once the engine has its answer: the
    // engine gives up on this call after five seconds and never sends it again, and these reach the
    // database and the engine. One task keeps their order: whatever the run still held goes back on
    // the board, then a coworker answering in a channel has its answer posted. Both are idempotent.
    const { event, runId } = parsed.data
    const endedRunId = isRunCompletion(event) && runId ? runId : null
    const channelEnding = channelRunEndingOf(parsed.data)
    if (endedRunId || channelEnding) {
        const scope = { workspaceId: engine.workspaceId }
        after(async () => {
            if (endedRunId) await releaseRunCheckouts(scope, endedRunId).catch(err => console.error('[engine-webhook] failed to release the checkouts of a run', err))
            if (channelEnding) await finishChannelTurnForRun(scope, channelEnding).catch(err => console.error('[engine-webhook] failed to finish a channel turn', err))
        })
    }

    const result = await recordNotification(token, parsed.data)
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status })

    return Response.json({ ok: true }, { status: 202 })
}
