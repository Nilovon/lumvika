'use client'

import { StepTransition } from '@lumvika/ui/steps'
import { useState, type ReactNode } from 'react'

// Drilling into a detail inside a side panel: the step slides in the direction of travel.
// `depth` is what tells forward from backward, so a three-level tab (list → edit → history) comes
// back out the way it went in.
export function PanelSteps({ stepKey, depth, children }: { stepKey: string; depth: number; children: ReactNode }) {
    const [previousDepth, setPreviousDepth] = useState(depth)
    const [direction, setDirection] = useState(1)

    if (previousDepth !== depth) {
        setPreviousDepth(depth)
        setDirection(depth < previousDepth ? -1 : 1)
    }

    return (
        <StepTransition stepKey={stepKey} direction={direction} className="flex min-h-0 flex-1 flex-col">
            {children}
        </StepTransition>
    )
}
