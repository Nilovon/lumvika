'use client'

import { useEffect, useState } from 'react'

const SECONDS_SHOWN_UNDER_MS = 2 * 60_000
const FAST_TICK_MS = 1000
const SLOW_TICK_MS = 15_000

// The clock a countdown reads, ticking by the second only once seconds are what it shows. Null
// until mounted: a clock read during the server render would not match the client's.
export function useCountdownNow(at: number | null): number | null {
    const [now, setNow] = useState<number | null>(null)

    useEffect(() => {
        if (at == null) return
        let timer: ReturnType<typeof setTimeout>
        const tick = () => {
            const current = Date.now()
            setNow(current)
            const remaining = at - current
            if (remaining <= 0) return
            timer = setTimeout(tick, remaining < SECONDS_SHOWN_UNDER_MS ? FAST_TICK_MS : SLOW_TICK_MS)
        }
        timer = setTimeout(tick, 0)
        return () => clearTimeout(timer)
    }, [at])

    return at == null ? null : now
}
