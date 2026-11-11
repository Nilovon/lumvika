import { afterEach, describe, expect, it, vi } from 'vitest'

import { readSseEvents } from '@/lib/live/sse'

import { createLiveHub } from './hub'
import { openLiveStream } from './stream'

async function readAll(body: ReadableStream<Uint8Array>): Promise<string> {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let text = ''
    for (;;) {
        const { done, value } = await reader.read()
        if (done) return text
        text += decoder.decode(value, { stream: true })
    }
}

describe('live stream', () => {
    afterEach(() => {
        vi.useRealTimers()
    })

    it('frames the hub events of the user as server-sent events', async () => {
        const hub = createLiveHub()
        const stream = openLiveStream({ hub, userId: 'alice', workspaces: [1] })
        stream.subscriber.send({ kind: 'change', change: { table: 'agents', op: 'UPDATE', row: { id: 'a1', workspace_id: 1 } } })
        stream.subscriber.send({ kind: 'broadcast', broadcast: { workspaceId: 1, event: 'cursor', payload: { userId: 'bob', x: 1, y: 2 } } })
        hub.resync()
        stream.close('shutdown')

        const text = await readAll(stream.body)
        expect(text.startsWith(':live\n\n')).toBe(true)
        expect(readSseEvents(text).events).toEqual([
            { event: 'change', data: '{"table":"agents","op":"UPDATE","row":{"id":"a1","workspace_id":1}}' },
            { event: 'broadcast', data: '{"workspaceId":1,"event":"cursor","payload":{"userId":"bob","x":1,"y":2}}' },
            { event: 'resync', data: '' },
        ])
        expect(await stream.closed).toMatchObject({ changes: 1, broadcasts: 1, resyncs: 1, ended: 'shutdown' })
    })

    it('leaves the hub and reports the workspaces it followed when the client goes', async () => {
        const hub = createLiveHub()
        const abort = new AbortController()
        const onClose = vi.fn()
        const stream = openLiveStream({ hub, userId: 'alice', workspaces: [1, 2], signal: abort.signal, onClose })
        abort.abort()
        expect(hub.size()).toBe(0)
        expect(onClose).toHaveBeenCalledWith(expect.objectContaining({ ended: 'client' }), { userId: 'alice', workspaces: [1, 2] })
        expect((await stream.closed).ended).toBe('client')
    })

    it('ends after its lifetime and sends heartbeats meanwhile', async () => {
        vi.useFakeTimers()
        const hub = createLiveHub()
        const stream = openLiveStream({ hub, userId: 'alice', workspaces: [], heartbeatMs: 10, lifetimeMs: 25 })
        vi.advanceTimersByTime(30)
        expect((await stream.closed).ended).toBe('lifetime')
        expect(await readAll(stream.body)).toBe(':live\n\n:\n\n:\n\n')
    })

    it('replaces what a client that stopped reading missed by one resync', async () => {
        const hub = createLiveHub()
        const stream = openLiveStream({ hub, userId: 'alice', workspaces: [1], bufferBytes: 64 })
        const change = (id: string) => stream.subscriber.send({ kind: 'change', change: { table: 'agents', op: 'UPDATE', row: { id } } })
        change('first')
        change('dropped-1')
        change('dropped-2')

        const reader = stream.body.getReader()
        const decoder = new TextDecoder()
        let text = ''
        for (let index = 0; index < 2; index++) text += decoder.decode((await reader.read()).value)
        change('after')
        stream.close('shutdown')
        for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            text += decoder.decode(value)
        }

        const events = readSseEvents(text).events
        expect(events.map(event => event.event)).toEqual(['change', 'resync', 'change'])
        expect(text).not.toContain('dropped')
        expect(text).toContain('after')
    })
})
