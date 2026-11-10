const chains = new Map<string, Promise<unknown>>()

// Serializes async sections per key so read-modify-write cycles on config.json/.env never
// interleave. In-process only (the engine is single-process); a multi-worker setup sharing
// LUMVIKA_DATA_DIR would need an on-disk lock instead.
// Invariant: never call withKeyedLock for the same key from within a locked section — the inner
// call would await a promise that only settles after the outer one, deadlocking.
export function withKeyedLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = chains.get(key) ?? Promise.resolve()
    const run = prev.then(() => fn())
    const tail = run.catch(() => {})
    chains.set(key, tail)
    tail.finally(() => {
        if (chains.get(key) === tail) chains.delete(key)
    })
    return run
}
