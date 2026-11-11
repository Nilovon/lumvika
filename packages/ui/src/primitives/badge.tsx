import type { ReactNode } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '../cn'
import { BorderBeam, type BorderBeamProps } from '../BorderBeam'
import { TextShimmer } from '../TextShimmer'

const badgeVariants = cva('badge-beam relative inline-flex items-center justify-center rounded-sm font-normal whitespace-nowrap', {
    variants: {
        size: {
            xs: 'gap-1 px-2 py-0.5 text-[10px]',
            sm: 'gap-1 px-2.5 py-1 text-xs',
            md: 'gap-1.5 px-3.5 py-1.5 text-sm',
            lg: 'gap-2 px-4 py-2 text-base',
        },
        fill: {
            soft: 'bg-[var(--badge-soft)]',
            outline: 'bg-transparent',
            media: 'bg-black/60 [--badge-fg:#fff]! backdrop-blur-sm',
        },
    },
    defaultVariants: { size: 'md', fill: 'soft' },
})

export type BadgeTone = NonNullable<BorderBeamProps['tone']>

export interface BadgeProps extends VariantProps<typeof badgeVariants> {
    children: ReactNode
    /** Couleur de l'anneau et du texte. Défaut 'brand'. */
    tone?: BadgeTone
    /** Forme du BorderBeam. Défaut 'ring'. */
    pattern?: BorderBeamProps['pattern']
    /** Fait tourner l'anneau. Défaut false (statique). */
    animated?: boolean
    glow?: boolean
    /** Applique le balayage TextShimmer sur le texte (children string uniquement). Défaut false. */
    shimmer?: boolean
    /** Largeur du trough shimmer en px (shimmer only). Défaut 16. */
    spread?: number
    /** Contenu rendu avant le texte, hors shimmer (facepile, icône…). */
    leading?: ReactNode
    /** Contenu rendu après le texte, hors shimmer (flèche, compteur…). */
    trailing?: ReactNode
    className?: string
}

export function Badge({
    children,
    tone = 'brand',
    pattern = 'ring',
    animated = false,
    glow = false,
    shimmer = false,
    spread = 16,
    leading,
    trailing,
    size,
    fill,
    className,
}: BadgeProps) {
    return (
        <span className={cn(badgeVariants({ size, fill }), `badge-beam--${tone}`, className)}>
            <BorderBeam pattern={pattern} tone={tone} glow={glow} animated={animated} />
            {leading}
            {shimmer && typeof children === 'string' ? (
                <TextShimmer spread={spread} duration={5}>
                    {children}
                </TextShimmer>
            ) : (
                children
            )}
            {trailing}
        </span>
    )
}

export { badgeVariants }
