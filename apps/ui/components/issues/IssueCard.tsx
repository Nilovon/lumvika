'use client'

import { IssueDueDate } from '@/components/issues/IssueDueDate'
import { IssuePriorityIndicator } from '@/components/issues/IssuePriorityIndicator'
import { WorkMemberAvatar } from '@/components/issues/WorkMemberAvatar'
import { cn } from '@/lib/utils'
import type { IssueSummary } from '@lumvika/contracts'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

export type IssueCardProps = {
    issue: IssueSummary
    // A control on the card's top right, such as the status picker of a board on a phone.
    action?: ReactNode
    className?: string
}

// An issue as a board card: its title first, then its reference, priority, due date and holder.
export function IssueCard({ issue, action, className }: IssueCardProps) {
    const t = useTranslations('issues.row')
    const working = !!issue.checkoutRunId && issue.assignee?.kind === 'agent'

    return (
        <div className={cn('flex flex-col gap-2 rounded-md border border-border bg-card px-2.5 py-2 shadow-xs', className)}>
            <div className="flex items-start gap-2">
                <span className="line-clamp-3 min-w-0 flex-1 text-[13px] leading-snug font-medium break-words">{issue.title}</span>
                {action}
            </div>
            <div className="flex min-w-0 items-center gap-2">
                <IssuePriorityIndicator priority={issue.priority} />
                <span className="font-mono text-[11px] text-muted-foreground">{issue.ref}</span>
                {issue.dueDate && <IssueDueDate dueDate={issue.dueDate} status={issue.status} />}
                {working && (
                    <span className="inline-flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
                        <span aria-hidden className="size-1.5 shrink-0 animate-pulse rounded-full bg-cyan-500" />
                        <span className="truncate">{t('workingShort')}</span>
                    </span>
                )}
                <WorkMemberAvatar member={issue.assignee} size="sm" working={working} className="ml-auto shrink-0" />
            </div>
        </div>
    )
}
