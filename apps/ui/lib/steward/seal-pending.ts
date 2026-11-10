import { generateId, type UIMessage } from 'ai'

import type { UnansweredReason } from '@/components/steward/widgets/question-answer'

import { widgetName } from './pending-widget'

// A widget whose answer has its own shape seals in that shape. The checkout is the one that matters:
// it renders whatever output it finds as a settled CheckoutResult, so a generic seal left a reloaded
// conversation stuck on "Still waiting on Stripe" for good, and handed the model a form the trial
// instructions never described.
const SEALED: Record<string, unknown> = { open_checkout: { ok: false, reason: 'dismissed' }, open_template_purchase: { ok: false, reason: 'dismissed' } }

type ToolPart = { type: string; toolCallId?: string; state?: string; output?: unknown }

// A widget the user walked away from instead of answering. The transcript would then carry a tool
// call with no result, and the next turn is refused by the provider on the spot, so the question is
// closed as unanswered before the model ever reads it. The browser does the same thing when the
// user types over a pending widget; this is the net for everything else, a reload included.
export function sealPendingWidgets(messages: UIMessage[], reason: UnansweredReason = 'abandoned'): UIMessage[] {
    let sealed = false

    const next = messages.map(message => {
        let touched = false
        const parts = message.parts.map(part => {
            const tool = part as ToolPart
            const name = widgetName(tool)
            if (!name || tool.state !== 'input-available') return part
            touched = true
            sealed = true
            return { ...part, state: 'output-available', output: SEALED[name] ?? { answered: false, reason } }
        })
        return touched ? { ...message, parts } : message
    })

    return sealed ? (next as UIMessage[]) : messages
}

// Typing over a pending widget lands in one write: the sealed question and the message that answers
// it. Sealed alone, even for a few microtasks, the question reads as answered and fires the chat's
// automatic resume alongside the send, and the two answers stream into the column over each other.
export function withTypedAnswer(messages: UIMessage[], text: string): UIMessage[] {
    return [...sealPendingWidgets(messages, 'typed'), { id: generateId(), role: 'user', parts: [{ type: 'text', text }] }]
}
