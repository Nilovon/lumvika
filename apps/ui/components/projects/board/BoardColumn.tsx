'use client'

import { IssueStatusBadge } from '@/components/issues/IssueStatusBadge'
import { Button } from '@/components/ui/button'
import { BoardCard } from '@/components/projects/board/BoardCard'
import { QuickAddIssue } from '@/components/projects/board/QuickAddIssue'
import { BanIcon } from '@/lib/icons'
import { cn } from '@/lib/utils'
import { useDroppable } from '@dnd-kit/core'
import type { IssueStatus, IssueSummary } from '@lumvika/contracts'
import { useTranslations } from 'next-intl'

export type ColumnDropData = { kind: 'column'; status: IssueStatus }

export const columnDropId = (status: IssueStatus) => `column:${status}`

export type DropTarget = { status: IssueStatus; beforeIssueId: string | null }

type BoardColumnProps = {
    status: IssueStatus
    issues: IssueSummary[]
    // How many cards the column holds in all; more than `issues` when the board loaded only part of it.
    total: number
    onShowMore: () => void
    loadingMore: boolean
    // While a card is dragged: whether this column takes it, and where it would land.
    dragging: { from: IssueStatus; allowed: boolean } | null
    target: DropTarget | null
    canAdd: boolean
    onCreate: (title: string, status: IssueStatus) => Promise<unknown>
    onOpen: (issue: IssueSummary) => void
    onStatusChange: (issue: IssueSummary, status: IssueStatus) => void
    alwaysShowStatus: boolean
    // On a phone the status switcher above already names the one column shown.
    showHeader?: boolean
    className?: string
}

export function BoardColumn({ status, issues, total, onShowMore, loadingMore, dragging, target, canAdd, onCreate, onOpen, onStatusChange, alwaysShowStatus, showHeader = true, className }: BoardColumnProps) {
    const t = useTranslations('projects.board')
    const tStatus = useTranslations('issues.status')
    const { setNodeRef } = useDroppable({ id: columnDropId(status), data: { kind: 'column', status } satisfies ColumnDropData })
    const refused = dragging && !dragging.allowed
    const targeted = target?.status === status
    const cut = total > issues.length
    const insertionOf = (issue: IssueSummary, index: number): 'before' | 'after' | null => {
        if (!targeted || refused) return null
        if (target.beforeIssueId === issue.id) return 'before'
        if (target.beforeIssueId === null && index === issues.length - 1) return 'after'
        return null
    }

    return (
        <section
            ref={setNodeRef}
            aria-label={t('columnLabel', { status: tStatus(status), count: total })}
            className={cn(
                'relative flex max-h-full min-h-0 flex-col rounded-lg bg-muted/50 transition-colors',
                targeted && !refused && 'bg-accent/70 ring-1 ring-primary/40',
                refused && 'bg-muted/30',
                className,
            )}
        >
            {showHeader ? (
                <header className="flex items-center gap-2 px-2.5 pt-2.5 pb-2">
                    <IssueStatusBadge status={status} />
                    <span className="text-xs text-muted-foreground tabular-nums">{total}</span>
                </header>
            ) : (
                <span aria-hidden className="h-2 shrink-0" />
            )}

            {refused && (
                <div className="pointer-events-none absolute inset-0 z-20 flex items-start justify-center rounded-lg border border-dashed border-destructive/40 bg-background/60 px-3 pt-14 text-center backdrop-blur-[1px]">
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        <BanIcon className="size-3.5 shrink-0 text-destructive" />
                        {t('notFrom', { from: tStatus(dragging.from) })}
                    </span>
                </div>
            )}

            <div className="flex min-h-12 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
                {issues.map((issue, index) => (
                    <BoardCard key={issue.id} issue={issue} insertion={insertionOf(issue, index)} onOpen={onOpen} onStatusChange={onStatusChange} alwaysShowStatus={alwaysShowStatus} />
                ))}
                {issues.length === 0 && !canAdd && <p className="px-1 py-3 text-center text-xs text-muted-foreground">{t('emptyColumn')}</p>}
                {targeted && !refused && issues.length === 0 && <span aria-hidden className="mx-1 h-0.5 rounded-full bg-primary" />}
                {cut && (
                    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-1 pt-1">
                        <span className="text-xs text-muted-foreground tabular-nums">{t('columnShown', { shown: issues.length, total })}</span>
                        <Button type="button" size="sm" variant="ghost" onClick={onShowMore} disabled={loadingMore} aria-label={t('showMoreIn', { status: tStatus(status) })} className="h-8 px-2 text-xs">
                            {t('showMore')}
                        </Button>
                    </div>
                )}
                {canAdd && <QuickAddIssue status={status} onCreate={onCreate} />}
            </div>
        </section>
    )
}
