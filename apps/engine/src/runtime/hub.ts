import { STEWARD_HUB_TOKEN_HEADER } from '@lumvika/contracts'
import type { LoadedAgent } from '../agents/types.js'
import { env } from '../config/env.js'
import { logger } from '../lib/logger.js'

const TIMEOUT_MS = 20_000

export type HubCaller = Pick<LoadedAgent, 'id' | 'brief'>

// The engine key alone does not prove a call comes from the steward, so the steward also hands back
// the token the hub signed into its brief.
export function hubCallerHeaders(caller: HubCaller): Record<string, string> {
    const hubToken = caller.brief?.hubToken
    return hubToken ? { 'x-lumvika-agent': caller.id, [STEWARD_HUB_TOKEN_HEADER]: hubToken } : { 'x-lumvika-agent': caller.id }
}

export async function callHub(caller: HubCaller, tool: string, args: Record<string, unknown>, timeoutMs = TIMEOUT_MS): Promise<unknown> {
    const { LUMVIKA_HUB_BASE_URL: hub, LUMVIKA_API_KEY: token } = env()
    if (!hub || !token) throw new Error('Service catalog is unavailable: the engine is not linked to a Lumvika hub.')
    const url = `${hub.replace(/\/$/, '')}/api/hub`

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...hubCallerHeaders(caller) },
            body: JSON.stringify({ tool, args }),
            signal: controller.signal,
        })
        if (!res.ok) {
            const body = await res.text().catch(() => '')
            logger.warn({ agent: caller.id, tool, status: res.status }, 'hub call failed')
            throw new Error(`Hub call failed (${res.status})${body ? `: ${body}` : ''}`)
        }
        return await res.json()
    } finally {
        clearTimeout(timer)
    }
}
