'use client'

import { GrainGradient, type GrainGradientProps } from '@paper-design/shaders-react'
import { useReducedMotion } from 'motion/react'

export type RewindBackdropShape = NonNullable<GrainGradientProps['shape']>

// Caps the canvas under a wide story card at 2x DPR, so two slides crossfading stay cheap.
const MAX_PIXEL_COUNT = 2_000_000

export function RewindBackdrop({ base, colors, shape }: { base: string; colors: string[]; shape: RewindBackdropShape }) {
    const reducedMotion = useReducedMotion()

    return (
        <GrainGradient
            aria-hidden
            className="pointer-events-none absolute inset-0"
            colorBack={base}
            colors={colors}
            shape={shape}
            softness={0.7}
            intensity={0.35}
            noise={0.3}
            speed={reducedMotion ? 0 : 0.6}
            maxPixelCount={MAX_PIXEL_COUNT}
        />
    )
}
