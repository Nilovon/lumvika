// No 'server-only': the lifecycle sweeper warms its pictures from a Trigger.dev task.

// Set by `ogFallbackResponse` when a capture failed and the generic 1200x630 brand image was served
// instead. That image would be stretched into the slot it was asked for, so an email drops the
// picture rather than show it.
const FALLBACK_HEADER = 'X-Og-Fallback'

/**
 * Asks for a captured picture before an email links it, and says whether it is really there. A cold
 * capture is a real browser on a shared service, and a mail client's image proxy that gives up
 * leaves a hole in the message; a warm one is served from lumvika-shot's disk cache. Never throws.
 */
export async function warmImage(url: string, timeoutMs: number): Promise<boolean> {
    try {
        // GET rather than HEAD: the point is to make the capture happen.
        const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
        if (!res.ok || res.headers.get(FALLBACK_HEADER)) return false
        await res.arrayBuffer()
        return true
    } catch (error) {
        console.error('[og] warm-up failed', url, error)
        return false
    }
}
