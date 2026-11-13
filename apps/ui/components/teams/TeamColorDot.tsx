import { cn } from '@/lib/utils'

// The colour a team was given, as stored (`#rrggbb`); a team without one shows an empty ring.
export function TeamColorDot({ color, className }: { color: string | null; className?: string }) {
    return <span aria-hidden className={cn('inline-block size-2.5 shrink-0 rounded-full', !color && 'border border-muted-foreground/50', className)} style={color ? { backgroundColor: color } : undefined} />
}
