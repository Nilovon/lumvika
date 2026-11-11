import type { ListenClient } from '@/lib/db'

type LiveListenerOptions = {
    channel: string
    // A closed client cannot open again: one is made per attempt.
    connect: () => ListenClient
    onNotification: (payload: string) => void
    // Every (re)open: notifications sent while the connection was down are gone.
    onOpen: () => void
    onFailure?: (error: unknown) => void
    retry?: { firstMs: number; maxMs: number }
}

export interface LiveListener {
    stop(): Promise<void>
}

// One LISTEN connection per process, opened again with a growing wait whenever it is lost.
export function startLiveListener({ channel, connect, onNotification, onOpen, onFailure, retry = { firstMs: 1000, maxMs: 30_000 } }: LiveListenerOptions): LiveListener {
    let client: ListenClient | undefined
    let stopped = false
    let attempt = 0
    let timer: ReturnType<typeof setTimeout> | undefined

    function schedule() {
        const delay = Math.min(retry.firstMs * 2 ** attempt, retry.maxMs)
        attempt += 1
        timer = setTimeout(() => void open(), delay)
        timer.unref?.()
    }

    async function open() {
        let next: ListenClient
        try {
            next = connect()
        } catch (error) {
            onFailure?.(error)
            schedule()
            return
        }
        client = next
        let lost = false
        const lose = (error?: unknown) => {
            if (lost || stopped) return
            lost = true
            if (error !== undefined) onFailure?.(error)
            next.end().catch(() => undefined)
            schedule()
        }
        next.on('error', lose)
        next.on('end', () => lose(new Error('The live connection ended.')))
        next.on('notification', message => {
            if (lost || stopped || message.channel !== channel || message.payload === undefined) return
            onNotification(message.payload)
        })

        try {
            await next.connect()
            if (lost || stopped) return
            await next.query(`LISTEN ${channel}`)
        } catch (error) {
            lose(error)
            return
        }
        if (lost || stopped) return
        attempt = 0
        onOpen()
    }

    void open()

    return {
        async stop() {
            stopped = true
            clearTimeout(timer)
            await client?.end().catch(() => undefined)
        },
    }
}
