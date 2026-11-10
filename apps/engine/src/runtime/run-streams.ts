type Subscriber = (chunk: Uint8Array | null) => void

type RunBuffer = {
    chunks: Uint8Array[]
    done: boolean
    subscribers: Set<Subscriber>
    evict?: ReturnType<typeof setTimeout>
}

const EVICT_AFTER_MS = 3 * 60 * 1000

const hub = new Map<string, RunBuffer>()

export function registerRunStream(runId: string, source: ReadableStream<Uint8Array>): void {
    const existing = hub.get(runId)
    if (existing?.evict) clearTimeout(existing.evict)
    const buf: RunBuffer = { chunks: [], done: false, subscribers: new Set() }
    hub.set(runId, buf)
    void (async () => {
        const reader = source.getReader()
        try {
            while (true) {
                const { done, value } = await reader.read()
                if (done) break
                buf.chunks.push(value)
                for (const sub of buf.subscribers) sub(value)
            }
        } catch {
        } finally {
            buf.done = true
            for (const sub of buf.subscribers) sub(null)
            buf.subscribers.clear()
            buf.evict = setTimeout(() => hub.delete(runId), EVICT_AFTER_MS)
        }
    })()
}

export function subscribeRunStream(runId: string): ReadableStream<Uint8Array> | null {
    const buf = hub.get(runId)
    if (!buf) return null
    let sub: Subscriber | undefined
    return new ReadableStream<Uint8Array>({
        start(controller) {
            for (const chunk of buf.chunks) controller.enqueue(chunk)
            if (buf.done) {
                controller.close()
                return
            }
            sub = chunk => {
                if (chunk === null) controller.close()
                else controller.enqueue(chunk)
            }
            buf.subscribers.add(sub)
        },
        cancel() {
            if (sub) buf.subscribers.delete(sub)
        },
    })
}
