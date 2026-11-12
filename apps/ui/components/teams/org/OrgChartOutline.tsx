'use client'

import type { OrgCoworker } from '@/components/teams/org/org-coworker'
import { OrgCoworkerMenu } from '@/components/teams/org/OrgCoworkerMenu'
import { OrgCoworkerSummary } from '@/components/teams/org/OrgCoworkerSummary'
import { Button } from '@/components/ui/button'
import { ChevronDownIcon, ChevronRightIcon } from '@/lib/icons'
import type { ReportingNode } from '@/lib/work/reporting-tree'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

type Node = ReportingNode<OrgCoworker>

// The chart on a phone: an indented list, each manager folding its reports away.
export function OrgChartOutline({ roots, onEdit }: { roots: Node[]; onEdit: (coworker: OrgCoworker) => void }) {
    return (
        <ul className="space-y-1">
            {roots.map(root => (
                <OutlineBranch key={root.coworker.id} node={root} onEdit={onEdit} />
            ))}
        </ul>
    )
}

function OutlineBranch({ node, onEdit }: { node: Node; onEdit: (coworker: OrgCoworker) => void }) {
    const t = useTranslations('teams.org')
    const [open, setOpen] = useState(true)
    const hasReports = node.reports.length > 0
    const Chevron = open ? ChevronDownIcon : ChevronRightIcon

    return (
        <li>
            <div className="flex items-center gap-1">
                {hasReports ? (
                    <Button variant="ghost" size="icon-sm" className="shrink-0 text-muted-foreground" aria-expanded={open} aria-label={open ? t('collapse', { name: node.coworker.name }) : t('expand', { name: node.coworker.name })} onClick={() => setOpen(value => !value)}>
                        <Chevron />
                    </Button>
                ) : (
                    <span className="size-7 shrink-0" />
                )}
                <OrgCoworkerMenu coworker={node.coworker} onEdit={onEdit}>
                    <button type="button" className="min-w-0 flex-1 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        <OrgCoworkerSummary coworker={node.coworker} compact />
                    </button>
                </OrgCoworkerMenu>
            </div>
            {hasReports && open && (
                <ul className="ml-3.5 space-y-1 border-l border-border pl-2">
                    {node.reports.map(report => (
                        <OutlineBranch key={report.coworker.id} node={report} onEdit={onEdit} />
                    ))}
                </ul>
            )}
        </li>
    )
}
