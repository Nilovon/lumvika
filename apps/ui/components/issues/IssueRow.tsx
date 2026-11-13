'use client'

import { IssueDueDate } from '@/components/issues/IssueDueDate'
import { IssuePriorityIndicator } from '@/components/issues/IssuePriorityIndicator'
import { IssueStatusBadge } from '@/components/issues/IssueStatusBadge'
import { WorkMemberAvatar } from '@/components/issues/WorkMemberAvatar'
import { cn } from '@/lib/utils'
import { shownRunFailure } from '@/lib/work/run-failure'
import type { IssueSummary } from '@lumvika/contracts'
import { Badge } from '@lumvika/ui/primitives'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

export type IssueRowProps = {
    issue: IssueSummary
    onOpen?: (issue: IssueSummary) => void
    // Replaces the status pill, for a list that lets the status change in place.
    status?: ReactNode
    // Shown before the title, such as the project an issue of "My work" belongs to.
    leading?: ReactNode
    className?: string
}

// One issue on one line, the shape every list of issues shares: priority, reference, title, status,
// due date and who holds it. On a row narrower than `lg` (a phone, a narrow card) the details wrap
// under the title.
export function IssueRow({ issue, onOpen, status, leading, className }: IssueRowProps) {
    const t = useTranslations('issues.row')
    const working = !!issue.checkoutRunId && issue.assignee?.kind === 'agent'
    const failed = !!shownRunFailure(issue)
    const content = (
        <>
            <IssuePriorityIndicator priority={issue.priority} className="@max-lg:hidden" />
            <span className="w-16 shrink-0 font-mono text-[11px] text-muted-foreground @max-lg:hidden">{issue.ref}</span>
            <span className="flex min-w-0 flex-1 flex-col gap-1 @lg:flex-row @lg:items-center @lg:gap-2">
                <span className="flex min-w-0 items-center gap-2">
                    {leading}
                    <span className="truncate text-sm">{issue.title}</span>
                </span>
                <span className="flex flex-wrap items-center gap-2 @lg:hidden">
                    <IssuePriorityIndicator priority={issue.priority} />
                    <span className="font-mono text-[11px] text-muted-foreground">{issue.ref}</span>
                    {status ?? <IssueStatusBadge status={issue.status} />}
                    {issue.dueDate && <IssueDueDate dueDate={issue.dueDate} status={issue.status} />}
                </span>
            </span>
            <span className="flex shrink-0 items-center gap-3 @max-lg:hidden">
                {issue.dueDate && <IssueDueDate dueDate={issue.dueDate} status={issue.status} />}
                {status ?? <IssueStatusBadge status={issue.status} />}
            </span>
            {failed && (
                <Badge size="xs" tone="red" glow={false} className="shrink-0 font-medium">
                    {t('failedShort')}
                </Badge>
            )}
            <WorkMemberAvatar member={issue.assignee} size="sm" working={working} className="shrink-0" />
        </>
    )

    const rowClass = cn('@container flex w-full items-center gap-3 border-b border-border px-3 py-2.5 text-left last:border-b-0', className)
    if (!onOpen) return <div className={rowClass}>{content}</div>
    return (
        <div
            role="button"
            tabIndex={0}
            aria-label={`${issue.ref} ${issue.title}`}
            onClick={() => onOpen(issue)}
            onKeyDown={event => {
                if (event.target !== event.currentTarget) return
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onOpen(issue)
                }
            }}
            className={cn(rowClass, 'cursor-pointer transition-colors outline-none hover:bg-muted/50 focus-visible:bg-muted/60')}
        >
            {content}
        </div>
    )
}
