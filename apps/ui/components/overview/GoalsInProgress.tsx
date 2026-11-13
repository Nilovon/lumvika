'use client'

import type { OverviewGoal } from '@/app/api/_services/work/overview.service'
import { dayOf } from '@/components/issues/issue-dates'
import { OverviewCard } from '@/components/overview/OverviewCard'
import { Progress } from '@/components/ui/progress'
import { shortDate } from '@lumvika/i18n/format'
import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'

const SHOWN = 4

// The active goals, nearest target first, with the issues of everything under them rolled up.
export function GoalsInProgress({ goals }: { goals: OverviewGoal[] }) {
    const t = useTranslations('overview.goals')
    const locale = useLocale()

    return (
        <OverviewCard title={t('title')} link={{ href: '/goals', label: t('all') }}>
            {goals.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t('empty')}</p>
            ) : (
                <ul className="-mx-2 flex flex-col">
                    {goals.slice(0, SHOWN).map(goal => {
                        const total = goal.rollup.open + goal.rollup.done
                        const percent = total === 0 ? 0 : Math.round((goal.rollup.done / total) * 100)
                        const label = total === 0 ? t('noIssues') : t('progress', { done: goal.rollup.done, total })
                        return (
                            <li key={goal.id}>
                                <Link href="/goals" className="flex min-w-0 flex-col gap-1.5 rounded-lg px-2 py-2 transition-colors outline-none hover:bg-muted/50 focus-visible:bg-muted/60">
                                    <span className="flex min-w-0 items-baseline justify-between gap-2">
                                        <span className="truncate text-sm font-medium">{goal.title}</span>
                                        {goal.targetDate && <span className="shrink-0 text-xs text-muted-foreground">{t('target', { date: shortDate(dayOf(goal.targetDate), locale) })}</span>}
                                    </span>
                                    <span className="flex items-center gap-2">
                                        <Progress value={percent} size="sm" label={label} className="min-w-16 flex-1" />
                                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{label}</span>
                                    </span>
                                </Link>
                            </li>
                        )
                    })}
                </ul>
            )}
        </OverviewCard>
    )
}
