'use client'

import type { OrgCoworker } from '@/components/teams/org/org-coworker'
import { OrgCoworkerMenu } from '@/components/teams/org/OrgCoworkerMenu'
import { OrgCoworkerFooter, OrgCoworkerSummary } from '@/components/teams/org/OrgCoworkerSummary'
import { cn } from '@/lib/utils'
import type { ReportingNode } from '@/lib/work/reporting-tree'
import { PANEL_CARD, PANEL_CARD_INTERACTIVE } from '@lumvika/ui/primitives'
import { useRef, type PointerEvent } from 'react'

type Node = ReportingNode<OrgCoworker>

// The chart drawn top-down, wider than the page when it has to be: it scrolls inside its frame and
// pans with a drag on its background.
export function OrgChartTree({ roots, onEdit }: { roots: Node[]; onEdit: (coworker: OrgCoworker) => void }) {
    const frameRef = useRef<HTMLDivElement>(null)
    const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null)

    // React bubbles the events of a portalled menu up here too: only a press on the chart's own
    // background starts a pan, or the pointer capture would swallow the menu's click.
    const startPan = (event: PointerEvent<HTMLDivElement>) => {
        const frame = frameRef.current
        const target = event.target as HTMLElement
        if (!frame || !frame.contains(target) || event.pointerType !== 'mouse' || event.button !== 0 || target.closest('button')) return
        drag.current = { x: event.clientX, y: event.clientY, left: frame.scrollLeft, top: frame.scrollTop }
        frame.setPointerCapture(event.pointerId)
    }

    const pan = (event: PointerEvent<HTMLDivElement>) => {
        const frame = frameRef.current
        if (!drag.current || !frame) return
        frame.scrollLeft = drag.current.left - (event.clientX - drag.current.x)
        frame.scrollTop = drag.current.top - (event.clientY - drag.current.y)
    }

    const endPan = () => {
        drag.current = null
    }

    return (
        <div
            ref={frameRef}
            onPointerDown={startPan}
            onPointerMove={pan}
            onPointerUp={endPan}
            onPointerCancel={endPan}
            className="max-h-[calc(100dvh-14rem)] min-h-64 cursor-grab overflow-auto rounded-lg border border-border bg-muted/10 active:cursor-grabbing"
        >
            <div className="mx-auto flex w-max min-w-full items-start justify-center gap-10 p-8">
                {roots.map(root => (
                    <OrgTreeBranch key={root.coworker.id} node={root} onEdit={onEdit} />
                ))}
            </div>
        </div>
    )
}

const CONNECTOR = 'bg-border'

function OrgTreeBranch({ node, onEdit }: { node: Node; onEdit: (coworker: OrgCoworker) => void }) {
    const last = node.reports.length - 1
    return (
        <div className="flex flex-col items-center">
            <OrgCoworkerMenu coworker={node.coworker} onEdit={onEdit}>
                <button type="button" className={cn(PANEL_CARD, PANEL_CARD_INTERACTIVE, 'flex w-56 cursor-pointer flex-col gap-2 bg-background p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring')}>
                    <OrgCoworkerSummary coworker={node.coworker} />
                    <OrgCoworkerFooter coworker={node.coworker} />
                </button>
            </OrgCoworkerMenu>
            {node.reports.length > 0 && (
                <>
                    <div className={cn('h-5 w-px', CONNECTOR)} />
                    <div className="flex items-start">
                        {node.reports.map((report, index) => (
                            <div key={report.coworker.id} className="relative flex flex-col items-center px-3">
                                {last > 0 && <div className={cn('absolute top-0 h-px', CONNECTOR, index === 0 ? 'right-0 left-1/2' : index === last ? 'right-1/2 left-0' : 'inset-x-0')} />}
                                <div className={cn('h-5 w-px', CONNECTOR)} />
                                <OrgTreeBranch node={report} onEdit={onEdit} />
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    )
}
