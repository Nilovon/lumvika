import type { CSSProperties, ElementType, FC, ReactNode } from 'react'
import { cn } from './cn'

// @react-three/fiber widens JSX.IntrinsicElements with every three.js object, which leaves TS
// unable to resolve the props of a bare `ElementType` tag in any app that pulls it in. Rendering
// through this concrete signature keeps `as` free at the call site.
type ShimmerTagProps = { className?: string; style?: CSSProperties; children?: ReactNode }

export interface TextShimmerProps {
    children: string
    /** HTML element to render. Defaults to 'span'. */
    as?: ElementType
    className?: string
    /** Animation duration in seconds. Defaults to 2. */
    duration?: number
    /** Animation delay in seconds, to keep sibling shimmers out of phase. Defaults to 0. */
    delay?: number
    /** Width (px) of the gradient highlight trough. Defaults to 16. */
    spread?: number
    /** When true, the spread scales with the text length (spread × children.length). */
    scaleSpreadWithLength?: boolean
}

/**
 * Animated "shimmer" sweep across text, via an animated background-position on a
 * `bg-clip-text` gradient. Pure CSS (no JS animation lib) so it works in Server
 * Components. The `text-shimmer` keyframe lives in `@lumvika/ui/styles.css`.
 *
 * Colors are overridable through two CSS vars (set them via `className`):
 *   --shimmer-base       text color (default: --muted-foreground)
 *   --shimmer-highlight  sweeping highlight color (default: --foreground)
 */
export function TextShimmer({
    children,
    as: Component = 'span',
    className,
    duration = 2,
    delay = 0,
    spread = 16,
    scaleSpreadWithLength = false,
}: TextShimmerProps) {
    const Tag = Component as FC<ShimmerTagProps>
    const effectiveSpread = scaleSpreadWithLength
        ? (children?.length ?? 0) * spread
        : spread

    return (
        <Tag
            className={cn(
                'relative inline-block bg-[length:250%_100%,auto] bg-clip-text text-transparent [background-repeat:no-repeat,padding-box]',
                '[--bg:linear-gradient(90deg,#0000_calc(50%-var(--spread)),var(--shimmer-highlight),#0000_calc(50%+var(--spread)))]',
                '[--shimmer-base:var(--muted-foreground)] [--shimmer-highlight:var(--foreground)]',
                className,
            )}
            style={
                {
                    '--spread': `${effectiveSpread}px`,
                    backgroundImage:
                        'var(--bg), linear-gradient(var(--shimmer-base), var(--shimmer-base))',
                    animation: `text-shimmer ${duration}s linear ${delay}s infinite`,
                } as CSSProperties
            }
        >
            {children}
        </Tag>
    )
}
