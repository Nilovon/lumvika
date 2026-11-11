import { fetch as expoFetch } from 'expo/fetch'
import { AppState } from 'react-native'

import { clientHeader, hubHeaders } from '@/api/client'
import { environment } from '@/config/environment'

// The hub's live stream (GET /api/v1/live, the web app's lib/live/protocol.ts): a change of a row the
// signed-in user may see, as server-sent events. One stream for the whole app, open while the app is
// in front and something listens.

export type LiveTable = 'agents' | 'notifications' | 'sessions' | 'spaces' | 'users' | 'workspace_members' | 'workspaces' | 'workspace_getting_started' | 'session_reads' | 'space_members'
export type LiveOp = 'INSERT' | 'UPDATE' | 'DELETE'

// `row` is the whole row for INSERT and UPDATE; for DELETE, its key and its workspace and user columns.
export type LiveChange = { table: LiveTable; op: LiveOp; row: Record<string, unknown> }

// A filter column the row lacks (a delete keeps only some) lets the change through.
export type LiveSubscription = { table: LiveTable; ops?: readonly LiveOp[]; filter?: Record<string, string | number> }

export type LiveHandlers = {
    onChange: (change: LiveChange) => void
    // Changes may have been missed while the stream was down: read again what is on screen.
    onResync?: () => void
}

type SseEvent = { event: string; data: string }

export function readSseEvents(buffer: string): { events: SseEvent[]; rest: string } {
    const blocks = buffer.replaceAll('\r\n', '\n').split('\n\n')
    const rest = blocks.pop() ?? ''
    const events = blocks.flatMap(block => {
        let event = 'message'
        const data: string[] = []
        for (const line of block.split('\n')) {
            if (line.startsWith(':')) continue
            const at = line.indexOf(':')
            const field = at === -1 ? line : line.slice(0, at)
            const value = at === -1 ? '' : line.slice(at + 1).replace(/^ /, '')
            if (field === 'event') event = value
            else if (field === 'data') data.push(value)
        }
        return data.length === 0 ? [] : [{ event, data: data.join('\n') }]
    })
    return { events, rest }
}

export function matchesSubscription(change: LiveChange, { table, ops, filter }: LiveSubscription): boolean {
    if (change.table !== table) return false
    if (ops && !ops.includes(change.op)) return false
    return Object.entries(filter ?? {}).every(([column, value]) => !(column in change.row) || String(change.row[column]) === String(value))
}

function parseChange(data: string): LiveChange | null {
    try {
        const parsed = JSON.parse(data) as Partial<LiveChange>
        if (typeof parsed.table !== 'string' || typeof parsed.op !== 'string' || !parsed.row || typeof parsed.row !== 'object') return null
        return parsed as LiveChange
    } catch {
        return null
    }
}

type Listener = { subscriptions: readonly LiveSubscription[]; handlers: LiveHandlers }

const HEALTHY_MS = 60_000
const RETRY = { firstMs: 1000, maxMs: 60_000 }

const listeners = new Set<Listener>()
let token: string | null = null
let stopCurrent: (() => void) | null = null

function each(call: (listener: Listener) => void) {
    for (const listener of [...listeners]) {
        try {
            call(listener)
        } catch (error) {
            console.warn('[live] listener failed', error)
        }
    }
}

function receive({ event, data }: SseEvent) {
    if (event === 'resync') {
        each(listener => listener.handlers.onResync?.())
        return
    }
    if (event !== 'change') return
    const change = parseChange(data)
    if (!change) return
    each(listener => {
        if (listener.subscriptions.some(subscription => matchesSubscription(change, subscription))) listener.handlers.onChange(change)
    })
}

function connect(accessToken: string, reopened: boolean): () => void {
    let stopped = false
    let attempt = 0
    let opened = reopened
    let timer: ReturnType<typeof setTimeout> | undefined
    let abort: AbortController | undefined

    async function open() {
        timer = undefined
        if (stopped) return
        abort = new AbortController()
        let openedAt: number | undefined
        try {
            const response = await expoFetch(`${environment.apiUrl}/api/v1/live`, {
                headers: { Accept: 'text/event-stream', ...hubHeaders(clientHeader, { accessToken }) },
                signal: abort.signal,
            })
            if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`)
            if (opened) each(listener => listener.handlers.onResync?.())
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
                read.events.forEach(receive)
            }
            if (stopped) return
            // The hub ends a stream after its lifetime: one that lived this long is opened again at once.
            if (Date.now() - openedAt >= HEALTHY_MS) {
                attempt = 0
                void open()
                return
            }
            throw new Error('The stream ended at once.')
        } catch {
            if (stopped) return
            if (openedAt !== undefined && Date.now() - openedAt >= HEALTHY_MS) attempt = 0
            timer = setTimeout(() => void open(), Math.min(RETRY.firstMs * 2 ** attempt, RETRY.maxMs))
            attempt += 1
        }
    }

    void open()
    return () => {
        stopped = true
        clearTimeout(timer)
        abort?.abort()
    }
}

function restart(reopened: boolean) {
    stopCurrent?.()
    stopCurrent = token && listeners.size > 0 && AppState.currentState === 'active' ? connect(token, reopened) : null
}

// iOS cuts a stream held in the background: it is closed there, and opened again in front, where
// the listeners are told to read again.
AppState.addEventListener('change', state => {
    if (state === 'active') {
        if (!stopCurrent) restart(true)
    } else if (state === 'background') {
        stopCurrent?.()
        stopCurrent = null
    }
})

// Follows the changes the subscriptions name, until the returned function is called. Every caller
// shares one stream; a new token (another account, a refreshed session) opens it again.
export function subscribeLive(accessToken: string, subscriptions: readonly LiveSubscription[], handlers: LiveHandlers): () => void {
    const listener: Listener = { subscriptions, handlers }
    listeners.add(listener)
    if (accessToken !== token) {
        token = accessToken
        restart(false)
    } else if (!stopCurrent) restart(false)
    return () => {
        listeners.delete(listener)
        if (listeners.size === 0) {
            stopCurrent?.()
            stopCurrent = null
        }
    }
}
