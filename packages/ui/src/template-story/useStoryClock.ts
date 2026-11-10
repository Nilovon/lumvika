'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export type StoryPosition = {
    index: number
    // Bumped on every move, including a click on the step already playing, so whatever animates the
    // step (the stepper's fill) can restart on it rather than on the index alone.
    run: number
}

// Walks the steps on their own durations, looping. A pause keeps what is left of the current step
// instead of starting it over: a visitor who hovers the board to read the card, then leaves, should
// not sit through the whole step again.
export function useStoryClock(durations: readonly number[], running: boolean) {
    const [position, setPosition] = useState<StoryPosition>({ index: 0, run: 0 })
    const remaining = useRef({ run: -1, ms: 0 })
    const count = durations.length
    // Clamped rather than trusted: the admin preview edits the steps under a running clock.
    const index = count > 0 ? Math.min(position.index, count - 1) : 0
    const duration = durations[index] ?? 0

    useEffect(() => {
        if (!running || count < 2) return
        if (remaining.current.run !== position.run) remaining.current = { run: position.run, ms: duration }

        const startedAt = performance.now()
        const run = position.run
        const timer = window.setTimeout(() => setPosition(current => ({ index: (Math.min(current.index, count - 1) + 1) % count, run: current.run + 1 })), remaining.current.ms)
        return () => {
            window.clearTimeout(timer)
            if (remaining.current.run === run) remaining.current.ms = Math.max(0, remaining.current.ms - (performance.now() - startedAt))
        }
    }, [running, count, duration, position.run])

    const goTo = useCallback((index: number) => setPosition(current => ({ index: ((index % count) + count) % count, run: current.run + 1 })), [count])

    return { index, run: position.run, goTo }
}
