import { cn } from '../cn'

const DEFAULT_COLOR = 'var(--stripes-ink)'
const DEFAULT_BAND = 10
const DEFAULT_PERIOD = 21
const stripesBg = (color: string, band: number, period: number) => `repeating-linear-gradient(65deg, ${color} 0 ${band}px, transparent ${band}px ${period}px)`
const FADES = {
    bottom: 'linear-gradient(to bottom, black, transparent)',
    top: 'linear-gradient(to top, black, transparent)',
    right: 'linear-gradient(to right, black, transparent)',
    // Both ends fade out, so a band of stripes can sit inside a taller surface without a hard seam.
    vertical: 'linear-gradient(to bottom, transparent, black 50%, transparent)',
} as const

// Union of four inward fades: mask layers composite as `add`, so the stripes survive only in a
// border-thick band along the edges and the middle is cleared. The intermediate stops approximate an
// ease-out curve over the whole band; a two-stop gradient fades linearly and banded visibly.
const SOFT_STOPS: [number, number][] = [
    [0, 1],
    [0.2, 0.78],
    [0.45, 0.45],
    [0.7, 0.16],
    [1, 0],
]
const edgesFade = (width: number) => (['right', 'left', 'bottom', 'top'] as const).map(side => `linear-gradient(to ${side}, ${SOFT_STOPS.map(([at, alpha]) => `rgb(0 0 0 / ${alpha}) ${Math.round(at * width)}px`).join(', ')})`).join(', ')

// Decorative diagonal stripes filling the closest positioned ancestor: give it `relative` and
// `overflow-hidden`, and `relative` to the siblings that must paint above the stripes. `band` and
// `period` tighten the hatch for short surfaces, where the default pitch reads as a few blocks.
export function Stripes({
    className,
    fade = 'bottom',
    edgeWidth = 96,
    color = DEFAULT_COLOR,
    band = DEFAULT_BAND,
    period = DEFAULT_PERIOD,
}: {
    className?: string
    fade?: keyof typeof FADES | 'edges'
    edgeWidth?: number
    color?: string
    band?: number
    period?: number
}) {
    const mask = fade === 'edges' ? edgesFade(edgeWidth) : FADES[fade]
    return (
        <span
            aria-hidden
            className={cn('pointer-events-none absolute inset-0', className)}
            style={{ backgroundImage: stripesBg(color, band, period), maskImage: mask, WebkitMaskImage: mask }}
        />
    )
}
