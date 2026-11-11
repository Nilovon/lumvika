import { afterEach, describe, expect, it, vi } from 'vitest'

import { connectLive, type LiveStatus } from './connection'
import type { SseEvent } from './sse'

function streamOf(chunks: string[], { hold = false } = {}): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder()
    return new ReadableStream({
        start(controller) {
            for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
            if (!hold) controller.close()
        },
    })
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0))

describe('connectLive', () => {
    afterEach(() => {
        vi.useRealTimers()
    })

    it('reads events split across chunks, and multi-byte characters split across them', async () => {
        const bytes = new TextEncoder().encode('event: change\ndata: {"name":"Zoë"}\n\n')
        const cut = bytes.indexOf(0xc3) + 1
        const body = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(new TextEncoder().encode(':live\n\n'))
                controller.enqueue(bytes.slice(0, cut))
                controller.enqueue(bytes.slice(cut))
            },
        })
        const events: SseEvent[] = []
        const statuses: LiveStatus[] = []
        const connection = connectLive({ url: '/api/live', fetch: async () => new Response(body), onEvent: event => events.push(event), onStatus: status => statuses.push(status) })
        await flush()
        await flush()
        connection.close()

        expect(events).toEqual([{ event: 'change', data: '{"name":"Zoë"}' }])
        expect(statuses).toEqual(['connecting', 'live'])
    })

    it('sends what init adds, such as a bearer token', async () => {
        const fetch = vi.fn(async () => new Response(streamOf([], { hold: true })))
        const connection = connectLive({ url: 'https://hub/api/v1/live', fetch, init: () => ({ headers: { authorization: 'Bearer t' } }), onEvent: () => undefined })
        await flush()
        connection.close()
        expect(fetch).toHaveBeenCalledWith('https://hub/api/v1/live', expect.objectContaining({ headers: { accept: 'text/event-stream', authorization: 'Bearer t' } }))
    })

    it('tries again with a growing wait, and tells a reopen apart from the first open', async () => {
        vi.useFakeTimers()
        const responses = [new Response(null, { status: 503 }), new Response(streamOf([':live\n\n'])), new Response(streamOf([], { hold: true }))]
        const fetch = vi.fn(async () => responses.shift()!)
        const opens: boolean[] = []
        const connection = connectLive({ url: '/api/live', fetch, onEvent: () => undefined, onOpen: reopened => opens.push(reopened), retry: { firstMs: 100, maxMs: 1000 } })

        await vi.advanceTimersByTimeAsync(0)
        expect(fetch).toHaveBeenCalledTimes(1)
        await vi.advanceTimersByTimeAsync(100)
        expect(fetch).toHaveBeenCalledTimes(2)
        // The second stream ended at once: the wait doubles.
        await vi.advanceTimersByTimeAsync(150)
        expect(fetch).toHaveBeenCalledTimes(2)
        await vi.advanceTimersByTimeAsync(50)
        expect(fetch).toHaveBeenCalledTimes(3)
        expect(opens).toEqual([false, true])
        connection.close()
    })

    it('skips the wait when asked to reconnect now', async () => {
        vi.useFakeTimers()
        const fetch = vi.fn(async () => new Response(null, { status: 503 }))
        const connection = connectLive({ url: '/api/live', fetch, onEvent: () => undefined, retry: { firstMs: 10_000, maxMs: 10_000 } })
        await vi.advanceTimersByTimeAsync(0)
        connection.reconnectNow()
        await vi.advanceTimersByTimeAsync(0)
        expect(fetch).toHaveBeenCalledTimes(2)
        connection.close()
    })
})
