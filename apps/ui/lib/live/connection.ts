import { readSseEvents, type SseEvent } from '@/lib/live/sse'

export type LiveStatus = 'connecting' | 'live' | 'offline'

type LiveConnectionOptions = {
    url: string
    fetch?: (url: string, init: RequestInit) => Promise<Response>
    init?: () => RequestInit
    onStatus?: (status: LiveStatus) => void
    onEvent: (event: SseEvent) => void
    // Every time the stream opens; `reopened` once it had been open before, when changes may have been missed.
    onOpen?: (reopened: boolean) => void
    retry?: { firstMs: number; maxMs: number }
}

export interface LiveConnection {
    // Skips the wait before the next attempt, e.g. when the network comes back.
    reconnectNow(): void
    close(): void
}

// The server ends a stream after its lifetime; one that lived this long was healthy and is opened again at once.
const HEALTHY_MS = 60_000

// The stream read with `fetch` rather than `EventSource`, so the mobile app can send its bearer token
// and a refused session (401) is told apart from a network failure.
export function connectLive({ url, fetch = (input, init) => globalThis.fetch(input, init), init, onStatus, onEvent, onOpen, retry = { firstMs: 1000, maxMs: 60_000 } }: LiveConnectionOptions): LiveConnection {
    let closed = false
    let attempt = 0
    let opened = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let abort: AbortController | undefined

    function schedule(delay: number) {
        onStatus?.('offline')
        timer = setTimeout(() => void open(), delay)
    }

    async function open() {
        timer = undefined
        if (closed) return
        abort = new AbortController()
        if (!opened) onStatus?.('connecting')
        let openedAt: number | undefined
        try {
            const extra = init?.() ?? {}
            const response = await fetch(url, {
                credentials: 'same-origin',
                ...extra,
                headers: { accept: 'text/event-stream', ...(extra.headers as Record<string, string> | undefined) },
                signal: abort.signal,
            })
            if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`)

            onStatus?.('live')
            onOpen?.(opened)
            opened = true
            openedAt = Date.now()
            const reader = response.body.getReader()
            const decoder = new TextDecoder()
            let buffer = ''
            for (;;) {
                const { done, value } = await reader.read()
                if (done) break
                const read = readSseEvents(buffer + decoder.decode(value, { stream: true }))
                buffer = read.rest
                for (const event of read.events) onEvent(event)
            }
            if (closed) return
            if (Date.now() - openedAt >= HEALTHY_MS) {
                attempt = 0
                void open()
                return
            }
            throw new Error('The stream ended at once.')
        } catch {
            if (closed) return
            // Waits grow only while streams keep failing young, e.g. behind a proxy that cuts them.
            if (openedAt !== undefined && Date.now() - openedAt >= HEALTHY_MS) attempt = 0
            schedule(Math.min(retry.firstMs * 2 ** attempt, retry.maxMs))
            attempt += 1
        }
    }

    void open()

    return {
        reconnectNow() {
            if (closed || timer === undefined) return
            clearTimeout(timer)
            void open()
        },
        close() {
            closed = true
            clearTimeout(timer)
            abort?.abort()
        },
    }
}
