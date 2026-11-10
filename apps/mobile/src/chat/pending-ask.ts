// The search's Ask Lumvika hands its text to the Steward page it opens, in memory: a route parameter
// could be set by any link the phone opens, and would send a message the person never typed.
let pending: string | null = null

export function setPendingAsk(text: string) {
    pending = text
}

export function takePendingAsk(): string | undefined {
    const text = pending ?? undefined
    pending = null
    return text
}
