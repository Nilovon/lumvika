import { formatSseEvent, SSE_HEARTBEAT } from '@/lib/live/sse'
import type { LiveEvent, LiveHub, LiveSubscriber } from '@/lib/live/server/hub'

export const LIVE_STREAM_HEADERS = {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    'x-accel-buffering': 'no',
    connection: 'keep-alive',
} as const

export type LiveStreamEnd = 'client' | 'lifetime' | 'shutdown'

export type LiveStreamSummary = { changes: number; broadcasts: number; resyncs: number; ended: LiveStreamEnd; durationMs: number }

type LiveStreamOptions = {
    hub: LiveHub
    userId: string
    workspaces: Iterable<number>
    signal?: AbortSignal
    // A comment line this often keeps proxies and socket timeouts from closing an idle stream.
    heartbeatMs?: number
    // The stream ends after this long: the client reconnects, and its session and memberships are checked again.
    lifetimeMs?: number
    // What a client that stopped reading may leave queued before it is sent a resync instead.
    bufferBytes?: number
    onClose?: (summary: LiveStreamSummary, left: { userId: string; workspaces: number[] }) => void
}

export type LiveStream = {
    body: ReadableStream<Uint8Array>
    subscriber: LiveSubscriber
    close(ended: LiveStreamEnd): void
    closed: Promise<LiveStreamSummary>
}

export function encodeLiveEvent(event: LiveEvent): string {
    if (event.kind === 'change') return formatSseEvent('change', JSON.stringify(event.change))
    if (event.kind === 'broadcast') return formatSseEvent('broadcast', JSON.stringify(event.broadcast))
    return formatSseEvent('resync', '')
}

export function openLiveStream({ hub, userId, workspaces, signal, heartbeatMs = 20_000, lifetimeMs = 30 * 60_000, bufferBytes = 256 * 1024, onClose }: LiveStreamOptions): LiveStream {
    const encoder = new TextEncoder()
    const started = Date.now()
    const counts = { changes: 0, broadcasts: 0, resyncs: 0 }
    let controller!: ReadableStreamDefaultController<Uint8Array>
    let open = true
    let behind = false
    let finish: (summary: LiveStreamSummary) => void = () => undefined
    const closed = new Promise<LiveStreamSummary>(resolve => {
        finish = resolve
    })

    // A client that stopped reading is not queued every change it misses: once it reads again it
    // gets one resync, and reads what it shows again.
    function write(text: string) {
        if (!open) return
        if ((controller.desiredSize ?? 0) <= 0) {
            behind = true
            return
        }
        if (behind) {
            behind = false
            controller.enqueue(encoder.encode(encodeLiveEvent({ kind: 'resync' })))
        }
        controller.enqueue(encoder.encode(text))
    }

    const body = new ReadableStream<Uint8Array>(
        {
            start(created) {
                controller = created
                // Sent at once, so the client knows the stream is open before the first change.
                created.enqueue(encoder.encode(':live\n\n'))
            },
            cancel() {
                close('client')
            },
        },
        new ByteLengthQueuingStrategy({ highWaterMark: bufferBytes })
    )

    const subscriber = hub.add(userId, workspaces, event => {
        if (event.kind === 'change') counts.changes += 1
        else if (event.kind === 'broadcast') counts.broadcasts += 1
        else counts.resyncs += 1
        write(encodeLiveEvent(event))
    })
    const heartbeat = setInterval(() => write(SSE_HEARTBEAT), heartbeatMs)
    const lifetime = setTimeout(() => close('lifetime'), lifetimeMs)
    const onAbort = () => close('client')
    signal?.addEventListener('abort', onAbort)

    function close(ended: LiveStreamEnd) {
        if (!open) return
        open = false
        const left = { userId, workspaces: [...subscriber.workspaces] }
        subscriber.remove()
        clearInterval(heartbeat)
        clearTimeout(lifetime)
        signal?.removeEventListener('abort', onAbort)
        try {
            controller.close()
        } catch {
            // Already cancelled by the client.
        }
        const summary = { ...counts, ended, durationMs: Date.now() - started }
        onClose?.(summary, left)
        finish(summary)
    }

    if (signal?.aborted) close('client')
    return { body, subscriber, close, closed }
}
