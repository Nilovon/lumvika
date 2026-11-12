'use client'

import { dayOf, isOverdue } from '@/components/issues/issue-dates'
import { CalendarIcon } from '@/lib/icons'
import { cn } from '@/lib/utils'
import type { IssueStatus } from '@lumvika/contracts'
import { dayAndMonth } from '@lumvika/i18n/format'
import { useLocale, useTranslations } from 'next-intl'

export function IssueDueDate({ dueDate, status, className }: { dueDate: string; status: IssueStatus; className?: string }) {
    const t = useTranslations('issues.row')
    const locale = useLocale()
    const date = dayAndMonth(dayOf(dueDate), locale)
    const overdue = isOverdue(dueDate, status)

    return (
        <span className={cn('inline-flex shrink-0 items-center gap-1 text-xs tabular-nums', overdue ? 'text-destructive' : 'text-muted-foreground', className)} title={overdue ? t('overdue', { date }) : t('due', { date })}>
            <CalendarIcon aria-hidden className="size-3" />
            {date}
        </span>
    )
}
