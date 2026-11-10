// What a workspace may connect, from the slot quantity on its Stripe subscription. Pure, so the
// billing webhook, the connect action and the hourly sweep read the same rules.

// Like max_agents: an increase lands at once, a decrease waits for the period to advance.
export function heldSlots(existing: number | null | undefined, derived: number, periodAdvanced: boolean): number {
    if (periodAdvanced || existing == null) return derived
    return Math.max(existing, derived)
}

export type ConnectState = {
    workspaceTrialing: boolean
    // The quantity Stripe bills, never the held one: a slot removed in the billing dialog stays
    // usable by what already fills it, not by a new account.
    stripeSlots: number
    liveConnections: number
    subscriberTrialOpen: boolean
    subscriberTrialAvailable: boolean
}

// How the next account gets its slot:
// - 'free_slot': a paid slot is empty;
// - 'workspace_trial_slot': the workspace is on its own trial, the slot goes on Stripe at $0 and is
//   charged with the plan at conversion;
// - 'subscriber_trial': the first slot of a paying workspace, free for TRIAL_DAYS;
// - 'buy_slot': nothing free, a slot has to be bought first.
export type ConnectAllowance = 'free_slot' | 'workspace_trial_slot' | 'subscriber_trial' | 'buy_slot'

// One slot at most while the workspace trial runs: a second one would end the trial (changePlan).
export const WORKSPACE_TRIAL_SLOT_CAP = 1

export function connectAllowance(state: ConnectState): ConnectAllowance {
    const trialSlot = state.subscriberTrialOpen ? 1 : 0
    if (state.liveConnections < state.stripeSlots + trialSlot) return 'free_slot'
    if (state.workspaceTrialing) return state.stripeSlots < WORKSPACE_TRIAL_SLOT_CAP && state.liveConnections < WORKSPACE_TRIAL_SLOT_CAP ? 'workspace_trial_slot' : 'buy_slot'
    if (state.stripeSlots === 0 && state.liveConnections === 0 && state.subscriberTrialAvailable) return 'subscriber_trial'
    return 'buy_slot'
}

// The connections a renewal no longer pays for: the most recent ones go first, the account the
// workspace has relied on longest stays.
export function connectionsToPause<T extends { id: string; created_at: string }>(connections: T[], allowed: number): string[] {
    if (connections.length <= allowed) return []
    const newestFirst = [...connections].sort((a, b) => b.created_at.localeCompare(a.created_at))
    return newestFirst.slice(0, connections.length - Math.max(0, allowed)).map(connection => connection.id)
}

// The "−" of the slot stepper: a slot can only be given back once nothing fills it.
export function canRemoveSlot(stripeSlots: number, liveConnections: number): boolean {
    return stripeSlots > 0 && liveConnections < stripeSlots
}
