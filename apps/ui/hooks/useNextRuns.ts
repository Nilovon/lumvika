'use client'

import { useEffect, useState } from 'react'

import { nextRunsByAgent, sameNextRuns, type NextRuns } from '@/lib/board/next-runs'
import { useBoardStore } from '@/stores/board.store'

const RECOMPUTE_MS = 30_000
// A run that just came due is replaced by the one after it, once the clock is safely past it.
const PAST_DUE_MS = 1000

const NONE: NextRuns = {}

// Each agent's soonest scheduled run. The same object comes back for as long as nothing moved, so
// the board does not rebuild its tiles on every tick.
export function useNextRuns(): NextRuns {
    const schedules = useBoardStore(state => state.agentSchedules)
    const [runs, setRuns] = useState<NextRuns>(NONE)

    useEffect(() => {
        let timer: ReturnType<typeof setTimeout>
        const recompute = () => {
            const now = Date.now()
            const next = nextRunsByAgent(schedules, now)
            setRuns(current => (sameNextRuns(current, next) ? current : next))
            const soonest = Math.min(...Object.values(next).map(run => run.at - now + PAST_DUE_MS), RECOMPUTE_MS)
            timer = setTimeout(recompute, soonest)
        }
        timer = setTimeout(recompute, 0)
        return () => clearTimeout(timer)
    }, [schedules])

    return runs
}
