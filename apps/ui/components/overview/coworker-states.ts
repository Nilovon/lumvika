import type { CoworkerCheckout } from '@/app/api/_services/work/overview.service'
import type { IsoAgent } from '@/lib/board/types'
import type { BadgeTone } from '@lumvika/ui/primitives'

export const COWORKER_STATES = ['working', 'waiting', 'error', 'idle', 'off'] as const
export type CoworkerState = (typeof COWORKER_STATES)[number]

export const COWORKER_STATE_TONES: Record<CoworkerState, BadgeTone> = { working: 'green', waiting: 'orange', error: 'red', idle: 'neutral', off: 'neutral' }

export type CoworkerNow = { agent: IsoAgent; state: CoworkerState; checkout: CoworkerCheckout | null }

// A coworker holding an issue is working on it, whatever the board last heard; otherwise the board's
// live status says. Working first, then the ones waiting on a person, and the ones switched off last.
export function coworkersNow(agents: readonly IsoAgent[], checkouts: readonly CoworkerCheckout[]): CoworkerNow[] {
    const checkoutOf = new Map<string, CoworkerCheckout>()
    for (const checkout of checkouts) {
        const known = checkoutOf.get(checkout.agentId)
        if (!known || (known.checkedOutAt ?? '') < (checkout.checkedOutAt ?? '')) checkoutOf.set(checkout.agentId, checkout)
    }
    const stateOf = (agent: IsoAgent): CoworkerState => {
        if (agent.disabledAt) return 'off'
        if (checkoutOf.has(agent.id) || agent.status === 'working') return 'working'
        if (agent.status === 'waiting_human') return 'waiting'
        if (agent.status === 'error') return 'error'
        if (agent.status === 'offline') return 'off'
        return 'idle'
    }
    return agents
        .map(agent => ({ agent, state: stateOf(agent), checkout: agent.disabledAt ? null : (checkoutOf.get(agent.id) ?? null) }))
        .sort((a, b) => COWORKER_STATES.indexOf(a.state) - COWORKER_STATES.indexOf(b.state) || a.agent.name.localeCompare(b.agent.name))
}
