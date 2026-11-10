import { Spinner } from './spinner'
import { cn } from '../cn'
import { BorderBeam } from '../BorderBeam'
import type { LucideIcon } from '../icons'

type IconBadgeProps = {
    /** Anneau coloré du BorderBeam. */
    tone?: 'brand' | 'white' | 'neutral' | 'green' | 'red'
    /** Icône centrée (optionnelle — absente pour un état loading). */
    icon?: LucideIcon
    /** Fait tourner l'anneau (loading). Défaut false (statique). */
    animated?: boolean
    /** Glow autour de l'anneau. Défaut true. */
    glow?: boolean
    className?: string
}

/**
 * Badge rond à icône : anneau BorderBeam + icône centrée.
 * Style partagé entre les checkmarks du pricing et les statuts de tools du chat.
 */
export function IconBadge({ tone = 'brand', icon: Icon, animated = false, glow = true, className }: IconBadgeProps) {
    return (
        <span className={cn('relative flex size-5 shrink-0 items-center justify-center rounded-full', className)}>
            <BorderBeam pattern="ring" tone={tone} glow={glow} animated={animated} />
            {Icon ? (
                <Icon className="size-3 text-foreground" />
            ) : animated ? (
                <Spinner className="size-2.5 text-foreground" />
            ) : null}
        </span>
    )
}
