'use client'

import { IssueCard } from '@/components/issues/IssueCard'
import { BOARD_STATUSES } from '@/components/issues/issue-status'
import { BoardColumn, type DropTarget } from '@/components/projects/board/BoardColumn'
import { MobileStatusSwitcher } from '@/components/projects/board/MobileStatusSwitcher'
import { useBoardDrag } from '@/components/projects/board/useBoardDrag'
import { canDropOn, groupByStatus } from '@/components/projects/board/board-logic'
import type { ProjectIssues } from '@/components/projects/useProjectIssues'
import { Switch } from '@/components/ui/switch'
import { Field } from '@/components/ui/field'
import { DndContext, DragOverlay } from '@dnd-kit/core'
import type { IssueStatus, IssueSummary } from '@lumvika/contracts'
import { useIsMobile } from '@lumvika/ui/primitives/use-is-mobile'
import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

const PHONE_BOARD_QUERY = '(max-width: 767.98px)'

type ProjectBoardProps = {
    projectId: string
    issues: IssueSummary[]
    ops: Pick<ProjectIssues, 'move' | 'create'>
    canAdd: boolean
    onOpenIssue: (issue: IssueSummary) => void
    // Goes through the host, which asks for the reason of Blocked.
    onStatusChange: (issue: IssueSummary, status: IssueStatus) => void
}

// The kanban of a project. On a wide screen every column sits side by side and a card is dragged
// across them; on a phone one column shows at a time behind a status switcher, and a card changes
// status from its own picker. Cancelled issues stay out of the way until asked for.
export function ProjectBoard({ projectId, issues, ops, canAdd, onOpenIssue, onStatusChange }: ProjectBoardProps) {
    const t = useTranslations('projects.board')
    const phone = useIsMobile(PHONE_BOARD_QUERY)
    const [showCancelled, setShowCancelled] = useState(false)
    const [phoneStatus, setPhoneStatus] = useState<IssueStatus>('todo')
    const columns = useMemo(() => groupByStatus(issues), [issues])
    const statuses = BOARD_STATUSES.filter(status => showCancelled || status !== 'cancelled')

    const drag = useBoardDrag({ columns, onMove: ops.move, onBlocked: issue => onStatusChange(issue, 'blocked') })

    const create = (title: string, status: IssueStatus) => ops.create({ projectId, title, status })

    const columnProps = (status: IssueStatus) => ({
        status,
        issues: columns[status],
        dragging: drag.dragged ? { from: drag.dragged.status, allowed: canDropOn(drag.dragged.status, status) } : null,
        target: drag.target as DropTarget | null,
        canAdd: canAdd && status !== 'cancelled' && status !== 'done',
        onCreate: create,
        onOpen: onOpenIssue,
        onStatusChange,
        alwaysShowStatus: phone,
    })

    const cancelledCount = columns.cancelled.length
    const shownPhoneStatus = statuses.includes(phoneStatus) ? phoneStatus : 'todo'

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 pt-3 md:px-6">
                {phone ? <MobileStatusSwitcher statuses={statuses} columns={columns} value={shownPhoneStatus} onChange={setPhoneStatus} /> : <p className="text-xs text-muted-foreground">{t('dragHint')}</p>}
                <Field orientation="row" label={t('showCancelled', { count: cancelledCount })} className="ml-auto gap-2">
                    <Switch checked={showCancelled} onCheckedChange={setShowCancelled} aria-label={t('showCancelled', { count: cancelledCount })} />
                </Field>
            </div>

            <DndContext sensors={drag.sensors} collisionDetection={drag.collisionDetection} onDragStart={drag.onDragStart} onDragMove={drag.onDragMove} onDragEnd={drag.onDragEnd} onDragCancel={drag.onDragCancel}>
                {phone ? (
                    <div className="flex min-h-0 flex-1 flex-col px-4 pt-3 pb-24">
                        <BoardColumn {...columnProps(shownPhoneStatus)} showHeader={false} className="min-h-0 flex-1" />
                    </div>
                ) : (
                    <div className="flex min-h-0 flex-1 items-stretch gap-3 overflow-x-auto px-4 pt-3 pb-24 md:px-6">
                        {statuses.map(status => (
                            <BoardColumn key={status} {...columnProps(status)} className="w-72 shrink-0" />
                        ))}
                    </div>
                )}
                {/* In a portal: a transformed ancestor would otherwise offset the fixed overlay from the pointer. */}
                {typeof document !== 'undefined' && createPortal(<DragOverlay dropAnimation={null}>{drag.dragged && <IssueCard issue={drag.dragged} className="w-68 rotate-1 cursor-grabbing shadow-lg" />}</DragOverlay>, document.body)}
            </DndContext>
        </div>
    )
}
