'use client'

import { IssueCard } from '@/components/issues/IssueCard'
import { IssueStatusPicker } from '@/components/issues/IssueStatusPicker'
import { cn } from '@/lib/utils'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import type { IssueStatus, IssueSummary } from '@lumvika/contracts'

export type CardDragData = { kind: 'card'; issue: IssueSummary }
export type CardDropData = { kind: 'card'; issueId: string; status: IssueStatus }

export const cardDropId = (issueId: string) => `card:${issueId}`

type BoardCardProps = {
    issue: IssueSummary
    // A line drawn above (or below) the card where the dragged card would land.
    insertion: 'before' | 'after' | null
    onOpen: (issue: IssueSummary) => void
    onStatusChange: (issue: IssueSummary, status: IssueStatus) => void
    // On a phone the status picker always shows: there is no other column to drag to.
    alwaysShowStatus: boolean
}

export function BoardCard({ issue, insertion, onOpen, onStatusChange, alwaysShowStatus }: BoardCardProps) {
    const { setNodeRef: setDragRef, listeners, attributes, isDragging } = useDraggable({ id: issue.id, data: { kind: 'card', issue } satisfies CardDragData })
    const { setNodeRef: setDropRef } = useDroppable({ id: cardDropId(issue.id), data: { kind: 'card', issueId: issue.id, status: issue.status } satisfies CardDropData })

    return (
        <div ref={setDropRef} className="relative">
            {insertion && <span aria-hidden className={cn('absolute inset-x-1 z-10 h-0.5 rounded-full bg-primary', insertion === 'before' ? '-top-1' : '-bottom-1')} />}
            <div
                ref={setDragRef}
                {...listeners}
                {...attributes}
                onClick={() => onOpen(issue)}
                onKeyDown={event => {
                    listeners?.onKeyDown?.(event)
                    if (event.key === 'Enter' && !event.defaultPrevented) onOpen(issue)
                }}
                className={cn('group cursor-grab touch-manipulation rounded-md outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing', isDragging && 'opacity-40')}
            >
                <IssueCard
                    issue={issue}
                    className="transition-colors group-hover:border-foreground/20"
                    action={
                        <span className={cn('shrink-0', !alwaysShowStatus && 'opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 has-[[aria-expanded=true]]:opacity-100')}>
                            <IssueStatusPicker status={issue.status} onChange={status => onStatusChange(issue, status)} />
                        </span>
                    }
                />
            </div>
        </div>
    )
}
