import type { IncomingMessage, Server } from 'node:http'
import { connect } from 'node:net'
import type { Duplex } from 'node:stream'
import { WebSocketServer, type WebSocket } from 'ws'
import { DESKTOP_WS_PATH, type DesktopViewMode } from '@rerun/contracts'
import { agentExists } from '../agents/loader.js'
import { driverActed, driverJoined, driverLeft, ensureDesktop, viewerJoined, viewerLeft } from './session.js'
import { verifyDesktopTicket } from './ticket.js'
import { logger } from '../lib/logger.js'

function refuse(socket: Duplex, status: string): void {
    socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`)
}

// KeyEvent, PointerEvent, and the extended key event noVNC prefers when the server offers it.
const INPUT_MESSAGE_TYPES = new Set([4, 5, 255])
const SHORTEST_INPUT_MESSAGE = 6

const POINTER_EVENT = 5

// The handshake never opens on one of these bytes with this length, so no RFB state is tracked.
// A pointer that moves with no button down is a person looking around, not one taking the screen.
const isInput = (data: Buffer): boolean => data.length >= SHORTEST_INPUT_MESSAGE && INPUT_MESSAGE_TYPES.has(data[0]!) && (data[0] !== POINTER_EVENT || data[1] !== 0)

async function pipeToVnc(ws: WebSocket, agentId: string, mode: DesktopViewMode): Promise<void> {
    let vncPort: number
    try {
        ;({ vncPort } = await ensureDesktop(agentId))
    } catch (err) {
        logger.warn({ err: String(err), agentId }, 'desktop viewer refused')
        ws.close(1011, 'desktop unavailable')
        return
    }
    const vnc = connect(vncPort, '127.0.0.1')
    const driving = mode === 'drive'
    viewerJoined(agentId)
    if (driving) driverJoined(agentId)
    let left = false
    const leave = () => {
        if (left) return
        left = true
        viewerLeft(agentId)
        if (driving) driverLeft(agentId)
        vnc.destroy()
        ws.close()
    }
    vnc.on('data', chunk => ws.send(chunk))
    vnc.once('close', leave)
    vnc.once('error', leave)
    ws.on('message', data => {
        if (driving && isInput(data as Buffer)) driverActed(agentId)
        vnc.write(data as Buffer)
    })
    ws.once('close', leave)
    ws.once('error', leave)
}

// The only route a browser reaches directly, so it accepts one path and nothing without a ticket.
// The screen it opens is the one of the agent the ticket names, never one the caller picks.
export function attachDesktopBridge(server: Server): void {
    const wss = new WebSocketServer({ noServer: true })
    server.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
        const url = new URL(request.url ?? '/', 'http://engine')
        if (url.pathname !== DESKTOP_WS_PATH) return refuse(socket, '404 Not Found')
        const ticket = verifyDesktopTicket(url.searchParams.get('ticket'))
        if (!ticket || !agentExists(ticket.agentId)) return refuse(socket, '401 Unauthorized')
        wss.handleUpgrade(request, socket, head, ws => void pipeToVnc(ws, ticket.agentId, ticket.mode))
    })
}
