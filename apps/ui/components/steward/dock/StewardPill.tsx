'use client'

import type { ReactNode } from 'react'
import { BorderBeam, type BorderBeamProps } from '@lumvika/ui'
import { ChromeBar } from '@lumvika/ui/chrome'

import { cn } from '@/lib/utils'

/** The end of the pill the ball caps: the one against the edge of the screen. */
export type StewardPillSide = 'left' | 'right'

type StewardPillProps = {
    side: StewardPillSide
    /** A width class. It is transitioned, so the pill grows where it stands. */
    width: string
    /** Lights the rim in a state's colour: orange when it waits for you, red when it failed. */
    tone?: BorderBeamProps['tone']
    hidden?: boolean
    children: ReactNode
}

/**
 * The parked Steward grown into a field: a chrome-high pill whose outer cap is the ball itself.
 * Laid in the ball's own slot, on its axis, it leaves under the ball the room the ball takes.
 */
export function StewardPill({ side, width, tone, hidden = false, children }: StewardPillProps) {
    return (
        <ChromeBar
            start={side === 'left' ? 'control' : 'text'}
            end={side === 'left' ? 'text' : 'control'}
            beamTone={tone ? 'white' : 'brand'}
            beamAnimated={!tone && !hidden}
            inert={hidden}
            className={cn(
                'pointer-events-auto absolute top-1/2 -translate-y-1/2 gap-0 font-normal transition-[width,opacity] duration-200 ease-out motion-reduce:transition-none',
                side === 'left' ? 'left-0 pl-[66px]' : 'right-0 pr-[60px]',
                width,
                hidden && 'pointer-events-none opacity-0'
            )}
        >
            {tone && <BorderBeam pattern="arcs" tone={tone} animated glow angle={53} outset={1} className="opacity-60" />}
            {children}
        </ChromeBar>
    )
}
