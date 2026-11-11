// 2 s, 5 s, 10 s after the account was born, then every 10 s up to a minute.
export const SIGNUP_STAMP_RETRY_DELAYS_MS: readonly number[] = [2_000, 3_000, 5_000, 10_000, 10_000, 10_000, 10_000, 10_000]

function sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise(resolve => {
        if (signal.aborted) return resolve()
        const timer = setTimeout(done, ms)
        signal.addEventListener('abort', done, { once: true })
        function done() {
            clearTimeout(timer)
            signal.removeEventListener('abort', done)
            resolve()
        }
    })
}

// Re-reads the signup stamp on a schedule until it is there, the signal aborts or the schedule
// runs out. A read that fails counts as "not there yet" and the next one still happens.
export async function awaitSignupStamp(read: () => Promise<string | null>, signal: AbortSignal, delays = SIGNUP_STAMP_RETRY_DELAYS_MS): Promise<string | null> {
    for (const delay of delays) {
        await sleep(delay, signal)
        if (signal.aborted) return null
        const stamp = await read().catch(() => null)
        if (signal.aborted) return null
        if (stamp) return stamp
    }
    return null
}
