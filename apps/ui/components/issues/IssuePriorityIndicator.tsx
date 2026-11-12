import { cn } from '@/lib/utils'
import type { IssuePriority } from '@lumvika/contracts'
import { useTranslations } from 'next-intl'

const FILLED_BARS: Record<Exclude<IssuePriority, 'urgent'>, number> = { none: 0, low: 1, medium: 2, high: 3 }
const BAR_HEIGHTS = ['h-1.5', 'h-2.5', 'h-3.5']

// Three rising bars filled up to the priority, an exclamation mark for urgent: readable at a glance
// in a dense column, and named for a screen reader.
export function IssuePriorityIndicator({ priority, showLabel = false, className }: { priority: IssuePriority; showLabel?: boolean; className?: string }) {
    const t = useTranslations('issues.priority')
    const label = t(priority)

    return (
        <span className={cn('inline-flex shrink-0 items-center gap-1.5', className)} title={showLabel ? undefined : label}>
            {priority === 'urgent' ? (
                <span aria-hidden className="flex size-3.5 items-center justify-center rounded-[3px] bg-destructive text-[10px] leading-none font-bold text-white">
                    !
                </span>
            ) : (
                <span aria-hidden className="flex h-3.5 w-3.5 items-end gap-px">
                    {BAR_HEIGHTS.map((height, index) => (
                        <span key={height} className={cn('w-1 rounded-[1px]', height, index < FILLED_BARS[priority] ? 'bg-foreground/80' : 'bg-muted-foreground/30')} />
                    ))}
                </span>
            )}
            {showLabel ? <span className="truncate text-xs">{label}</span> : <span className="sr-only">{t('ariaLabel', { priority: label })}</span>}
        </span>
    )
}
