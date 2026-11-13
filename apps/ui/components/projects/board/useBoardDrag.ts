'use client'

import type { CardDragData, CardDropData } from '@/components/projects/board/BoardCard'
import type { ColumnDropData, DropTarget } from '@/components/projects/board/BoardColumn'
import { canDropOn, dropPosition, type BoardColumns } from '@/components/projects/board/board-logic'
import { nextStatuses } from '@/components/issues/issue-status'
import {
    KeyboardSensor,
    MouseSensor,
    pointerWithin,
    rectIntersection,
    TouchSensor,
    useSensor,
    useSensors,
    type Active,
    type CollisionDetection,
    type DragEndEvent,
    type DragMoveEvent,
    type DragStartEvent,
    type Over,
} from '@dnd-kit/core'
import type { IssueStatus, IssueSummary } from '@lumvika/contracts'
import { formatList } from '@lumvika/i18n/format'
import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'
import { toast } from 'sonner'

type DropData = CardDropData | ColumnDropData

// Under the pointer a card sits inside its column: the card wins, so the drop lands next to it.
const collisionDetection: CollisionDetection = args => {
    const underPointer = pointerWithin(args)
    const hits = underPointer.length > 0 ? underPointer : rectIntersection(args)
    const card = hits.find(hit => String(hit.id).startsWith('card:'))
    return card ? [card] : hits.slice(0, 1)
}

function targetOf(active: Active, over: Over | null, columns: BoardColumns): DropTarget | null {
    const data = over?.data.current as DropData | undefined
    if (!over || !data) return null
    if (data.kind === 'column') return { status: data.status, beforeIssueId: null }

    const column = columns[data.status]
    // Over its own card, the card stays where it is: just above the card that follows it.
    if (data.issueId === active.id) return { status: data.status, beforeIssueId: column[column.findIndex(issue => issue.id === active.id) + 1]?.id ?? null }
    const others = column.filter(issue => issue.id !== active.id)
    const index = others.findIndex(issue => issue.id === data.issueId)
    if (index === -1) return { status: data.status, beforeIssueId: null }
    const dragged = active.rect.current.translated
    const lowerHalf = dragged ? dragged.top + dragged.height / 2 > over.rect.top + over.rect.height / 2 : false
    return { status: data.status, beforeIssueId: lowerHalf ? (others[index + 1]?.id ?? null) : data.issueId }
}

function sameTarget(a: DropTarget | null, b: DropTarget | null): boolean {
    return a?.status === b?.status && a?.beforeIssueId === b?.beforeIssueId
}

// Where a dragged card would land, and what its drop does: a new place, a refusal the workflow
// names, or the reason Blocked asks for. The place goes to the server as the card it lands above (null
// for the end), so a column the board shows only part of is placed in full there; the position worked
// out here only shows the card before the server answers.
export function useBoardDrag({ columns, onMove, onBlocked }: { columns: BoardColumns; onMove: (issue: IssueSummary, status: IssueStatus, position: number, beforeIssueId: string | null) => Promise<boolean>; onBlocked: (issue: IssueSummary) => void }) {
    const t = useTranslations('projects.board')
    const tStatus = useTranslations('issues.status')
    const locale = useLocale()
    const [dragged, setDragged] = useState<IssueSummary | null>(null)
    const [target, setTarget] = useState<DropTarget | null>(null)

    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
        // Space picks a card up, Enter opens it.
        useSensor(KeyboardSensor, { keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] } }),
    )

    const reset = () => {
        setDragged(null)
        setTarget(null)
    }

    const refuse = (issue: IssueSummary, to: IssueStatus) => {
        const targets = formatList(nextStatuses(issue.status).map(status => tStatus(status)), locale, 'disjunction')
        toast.error(t('refused', { ref: issue.ref, from: tStatus(issue.status), to: tStatus(to) }), { description: t('refusedHint', { from: tStatus(issue.status), targets }) })
    }

    const onDragStart = ({ active }: DragStartEvent) => setDragged((active.data.current as CardDragData | undefined)?.issue ?? null)

    const onDragMove = ({ active, over }: DragMoveEvent) => {
        const next = targetOf(active, over, columns)
        setTarget(current => (sameTarget(current, next) ? current : next))
    }

    const onDragEnd = ({ active, over }: DragEndEvent) => {
        const issue = (active.data.current as CardDragData | undefined)?.issue
        const landing = targetOf(active, over, columns)
        reset()
        if (!issue || !landing) return
        if (!canDropOn(issue.status, landing.status)) return refuse(issue, landing.status)
        if (landing.status === 'blocked' && issue.status !== 'blocked') return onBlocked(issue)

        const column = columns[landing.status]
        if (landing.status === issue.status) {
            const nextId = column[column.findIndex(other => other.id === issue.id) + 1]?.id ?? null
            if (landing.beforeIssueId === nextId || landing.beforeIssueId === issue.id) return
        }
        void onMove(issue, landing.status, dropPosition(column, issue.id, landing.beforeIssueId), landing.beforeIssueId)
    }

    return { sensors, collisionDetection, dragged, target, onDragStart, onDragMove, onDragEnd, onDragCancel: reset }
}
