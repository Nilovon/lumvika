'use client'

import { TOUR_AGENTS_PHASE, useTourBeat } from '@rerun/ui/tour'
import { usePrefersReducedMotion } from '@rerun/ui/iso-grid'
import { useState } from 'react'

// The first two slides of the tour played as one scene, with nobody clicking Continue: the Boxes
// draw themselves, then the agents land in them. It stops there rather than going on to the marks
// and the tools, and rather than looping. What the dialog has to say is what a Box is, and the
// answer is the machines standing in it; everything the tour plugs in afterwards is another slide's
// argument, and replayed here it would turn an illustration into a demo nobody asked to watch.
//
// A Box that redrew itself every ten seconds would read as a bug, and the plateau it ends on is not
// still anyway, the agents go on working (cf. tour-life).
//
// The single hold is the cascade of the first phase plus a breath, so the agents do not start
// falling while a Box is still drawing itself: three Boxes at 620ms apart drawing for 900ms. Taken
// from the constants of @rerun/ui/tour's tour-board.ts, which are what actually time that wave.
const WALK_BEATS: readonly { hold: number }[] = [{ hold: 2600 }]

export function useBoxExplainerWalk(): number {
    const still = usePrefersReducedMotion()
    const [arrived, setArrived] = useState(false)
    // Paused rather than clamped once the walk is over: left running, the chain of timeouts would
    // keep firing for as long as the dialog is open, for a phase that no longer moves.
    const tick = useTourBeat(WALK_BEATS, still || arrived)

    if (tick >= TOUR_AGENTS_PHASE && !arrived) setArrived(true)

    // Reduced motion gets the finished plateau on the first frame. useTourStage freezes the rest.
    return still ? TOUR_AGENTS_PHASE : Math.min(tick, TOUR_AGENTS_PHASE)
}
