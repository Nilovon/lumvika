// Shared with the browser, which is why it lives apart from the signature code in events.ts.

// The events a coworker can be woken by, as the user picks them. Linkup names them one way on the
// subscription and another on the payload: `message_received` arrives as `message`.
export const WAKE_EVENTS = ['message_received', 'accepted_invitation', 'invitation_received'] as const

export type WakeEvent = (typeof WAKE_EVENTS)[number]

export const WAKE_EVENT_LABELS: Record<WakeEvent, string> = {
    message_received: 'A message arrives',
    accepted_invitation: 'An invitation is accepted',
    invitation_received: 'An invitation is received',
}

export function isWakeEvent(value: string): value is WakeEvent {
    return (WAKE_EVENTS as readonly string[]).includes(value)
}
