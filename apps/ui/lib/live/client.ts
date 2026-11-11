'use client'

import { authClient } from '@/lib/auth/auth-client'
import { connectLive, type LiveConnection, type LiveStatus } from '@/lib/live/connection'
import { isLiveTable, LIVE_PATH, type LiveBroadcast, type LiveChange } from '@/lib/live/protocol'
import type { SseEvent } from '@/lib/live/sse'

export type LiveListener = {
    onChange?: (change: LiveChange) => void
    onBroadcast?: (broadcast: LiveBroadcast) => void
    // Changes may have been missed: the stream (re)opened, the tab came back, the network came back.
    onResync?: () => void
}

// One stream per tab, shared by every hook: opened with the first listener, closed a moment after the
// last one leaves, so a remount does not reconnect.
const CLOSE_DELAY_MS = 2000

const listeners = new Set<LiveListener>()
let connection: LiveConnection | null = null
let status: LiveStatus = 'offline'
let closeTimer: ReturnType<typeof setTimeout> | undefined
const statusListeners = new Set<(status: LiveStatus) => void>()

function each(call: (listener: LiveListener) => void) {
    for (const listener of [...listeners]) {
        try {
            call(listener)
        } catch (error) {
            console.error('[live] listener failed', error)
        }
    }
}

export function parseLiveEvent(event: SseEvent): { kind: 'change'; change: LiveChange } | { kind: 'broadcast'; broadcast: LiveBroadcast } | { kind: 'resync' } | null {
    if (event.event === 'resync') return { kind: 'resync' }
    let data: unknown
    try {
        data = JSON.parse(event.data)
    } catch {
        return null
    }
    if (!data || typeof data !== 'object') return null
    const fields = data as Record<string, unknown>
    if (event.event === 'change') {
        const { table, op, row } = fields
        if (!isLiveTable(table) || (op !== 'INSERT' && op !== 'UPDATE' && op !== 'DELETE') || !row || typeof row !== 'object') return null
        return { kind: 'change', change: { table, op, row: row as Record<string, unknown> } }
    }
    if (event.event === 'broadcast') {
        const { workspaceId, event: name, payload } = fields
        if (typeof workspaceId !== 'number' || typeof name !== 'string' || !payload || typeof payload !== 'object') return null
        return { kind: 'broadcast', broadcast: { workspaceId, event: name, payload: payload as Record<string, unknown> } }
    }
    return null
}

function receive(event: SseEvent) {
    const parsed = parseLiveEvent(event)
    if (!parsed) return
    if (parsed.kind === 'change') each(listener => listener.onChange?.(parsed.change))
    else if (parsed.kind === 'broadcast') each(listener => listener.onBroadcast?.(parsed.broadcast))
    else each(listener => listener.onResync?.())
}

function setStatus(next: LiveStatus) {
    status = next
    for (const listener of statusListeners) listener(next)
}

const onVisible = () => {
    if (document.visibilityState !== 'visible') return
    connection?.reconnectNow()
    each(listener => listener.onResync?.())
}
const onOnline = () => {
    connection?.reconnectNow()
    each(listener => listener.onResync?.())
}

// A sign-in, a sign-out or a switch of account can happen without a page load: the stream is opened
// again with the new session, and every listener reads what it shows again.
let followingSession = false
function followSession() {
    if (followingSession) return
    followingSession = true
    authClient.$store.listen('$sessionSignal', () => {
        if (!connection) return
        connection.close()
        connection = null
        open()
    })
}

function open() {
    followSession()
    connection = connectLive({
        url: LIVE_PATH,
        onStatus: setStatus,
        onEvent: receive,
        onOpen: () => each(listener => listener.onResync?.()),
    })
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)
}

function close() {
    connection?.close()
    connection = null
    setStatus('offline')
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('online', onOnline)
}

export function subscribeLive(listener: LiveListener): () => void {
    listeners.add(listener)
    clearTimeout(closeTimer)
    if (!connection) open()
    // Joining a stream already open is a subscribe like any other: what is on screen is read again.
    else if (status === 'live') queueMicrotask(() => listeners.has(listener) && listener.onResync?.())
    return () => {
        listeners.delete(listener)
        if (listeners.size > 0) return
        clearTimeout(closeTimer)
        closeTimer = setTimeout(() => {
            if (listeners.size === 0) close()
        }, CLOSE_DELAY_MS)
    }
}

export function liveStatus(): LiveStatus {
    return status
}

export function onLiveStatus(listener: (status: LiveStatus) => void): () => void {
    statusListeners.add(listener)
    return () => statusListeners.delete(listener)
}
