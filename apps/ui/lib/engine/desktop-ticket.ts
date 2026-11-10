import { createHmac } from 'crypto'

import { DESKTOP_TICKET_TTL_MS, type DesktopViewMode } from '@lumvika/contracts'

// The engine checks this in apps/engine/src/desktop/ticket.ts with the same key, so the Box key
// itself never reaches a browser: what does is good for one WebSocket handshake within the minute,
// on the screen of the one agent it names. The mode tells the engine whether its holder drives the
// screen, which keeps the agent's own hands off it, or only watches.
export function mintDesktopTicket(engineApiKey: string, engineAgentId: string, mode: DesktopViewMode, now: number = Date.now()): string {
    const payload = Buffer.from(JSON.stringify({ exp: now + DESKTOP_TICKET_TTL_MS, agent: engineAgentId, mode })).toString('base64url')
    return `${payload}.${createHmac('sha256', engineApiKey).update(payload).digest('base64url')}`
}
