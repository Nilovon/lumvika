import { createHmac, timingSafeEqual } from 'node:crypto'
import { desktopViewModeSchema, type DesktopViewMode } from '@rerun/contracts'
import { env } from '../config/env.js'

function signedWith(key: string, payload: string, signature: string | undefined): boolean {
    if (!signature) return false
    const expected = Buffer.from(createHmac('sha256', key).update(payload).digest('base64url'))
    const given = Buffer.from(signature)
    return expected.length === given.length && timingSafeEqual(expected, given)
}

// A browser cannot put a bearer header on a WebSocket, and the box key must never reach one. The
// hub signs a one-minute ticket with that key instead, and it rides in the query string. The ticket
// names the one agent whose screen it opens and whether its holder drives it or only watches. An
// engine that runs without a key skips the signature, like its HTTP API skips the bearer.
export type DesktopTicket = { agentId: string; mode: DesktopViewMode }

export function verifyDesktopTicket(raw: string | null | undefined, now: number = Date.now()): DesktopTicket | null {
    const [payload, signature] = (raw ?? '').split('.')
    if (!payload) return null
    const key = env().RERUN_API_KEY
    if (key && !signedWith(key, payload, signature)) return null
    try {
        const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { exp?: unknown; agent?: unknown; mode?: unknown }
        if (typeof claims.exp !== 'number' || claims.exp < now) return null
        if (typeof claims.agent !== 'string' || !claims.agent) return null
        return { agentId: claims.agent, mode: desktopViewModeSchema.catch('drive').parse(claims.mode) }
    } catch {
        return null
    }
}
