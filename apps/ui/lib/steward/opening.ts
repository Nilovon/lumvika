import type { UIMessage } from 'ai'

import { parseKickoff, type KickoffIntent } from './kickoff-marker'

// What the conversation was opened with. The first user message is the app's own opening marker,
// so it is the only one worth reading: anything further down is the user talking, and an intent
// asserted there would be one the browser made up after the fact.
export function arrivingIntent(messages: UIMessage[]): KickoffIntent | null {
    const opening = messages.find(message => message.role === 'user')
    if (!opening) return null

    for (const part of opening.parts) {
        if (part.type !== 'text') continue
        const parsed = parseKickoff((part as { text: string }).text)
        if (parsed) return parsed.intent
    }
    return null
}
