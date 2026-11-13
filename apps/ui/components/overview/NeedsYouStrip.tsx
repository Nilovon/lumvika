'use client'

import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { formatNumber } from '@lumvika/i18n/format'
import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'

export type NeedsYouCounts = { toReview: number; blocked: number; waiting: number | null; assigned: number }

const TILES = [
    { key: 'toReview', label: 'toReview', href: '/review' },
    { key: 'blocked', label: 'blocked', href: '/review?tab=blocked' },
    { key: 'waiting', label: 'waiting', href: '/review?tab=conversations' },
    { key: 'assigned', label: 'assigned', href: '/work' },
] as const

// The four numbers that answer "what needs me", each opening the screen that lists them.
export function NeedsYouStrip({ counts }: { counts: NeedsYouCounts }) {
    const t = useTranslations('overview.needsYou')
    const locale = useLocale()

    return (
        <nav aria-label={t('label')} className="grid grid-cols-2 gap-3 @xl:grid-cols-4">
            {TILES.map(tile => {
                const value = counts[tile.key]
                const waiting = value !== null && value > 0
                return (
                    <Link
                        key={tile.key}
                        href={tile.href}
                        className="group flex min-w-0 flex-col justify-between gap-1 rounded-xl border border-border bg-card px-4 py-3 transition-colors outline-none hover:border-foreground/20 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/50"
                    >
                        <span className="line-clamp-2 text-xs break-words hyphens-auto text-muted-foreground">{t(tile.label)}</span>
                        {value === null ? <Skeleton className="my-1 h-6 w-8" /> : <span className={cn('text-2xl leading-8 font-semibold', waiting ? 'text-foreground' : 'text-muted-foreground')}>{formatNumber(value, locale)}</span>}
                    </Link>
                )
            })}
        </nav>
    )
}
