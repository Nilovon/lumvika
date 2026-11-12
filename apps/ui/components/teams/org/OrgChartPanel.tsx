'use client'

import { NAV_ICONS } from '@/components/layout/sidebar/nav-icons'
import { CoworkerReportingDialog } from '@/components/teams/org/CoworkerReportingDialog'
import type { OrgCoworker } from '@/components/teams/org/org-coworker'
import { OrgChartOutline } from '@/components/teams/org/OrgChartOutline'
import { OrgChartTree } from '@/components/teams/org/OrgChartTree'
import { useOrgChart } from '@/components/teams/org/useOrgChart'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { PANEL_CARD } from '@lumvika/ui/primitives'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

export function OrgChartPanel() {
    const t = useTranslations('teams')
    const { coworkers, tree, failed, reload } = useOrgChart()
    const [editing, setEditing] = useState<OrgCoworker | null>(null)

    if (failed && !tree) {
        return (
            <EmptyState
                icon={NAV_ICONS.teams}
                title={t('org.loadFailed')}
                action={
                    <Button size="sm" variant="outline" onClick={() => void reload()}>
                        {t('retry')}
                    </Button>
                }
                className="py-16"
            />
        )
    }
    if (!tree || !coworkers) return <OrgChartSkeleton />
    if (tree.length === 0) return <EmptyState icon={NAV_ICONS.teams} title={t('org.empty.title')} description={t('org.empty.description')} className="py-16" />

    return (
        // The card narrows when the Steward panel is open: the chart follows the card, not the window.
        <div className="@container space-y-4">
            <p className="text-xs text-muted-foreground">{t('org.hint')}</p>
            <div className="hidden @xl:block">
                <OrgChartTree roots={tree} onEdit={setEditing} />
            </div>
            <div className="@xl:hidden">
                <OrgChartOutline roots={tree} onEdit={setEditing} />
            </div>
            <CoworkerReportingDialog coworker={editing} coworkers={coworkers} onOpenChange={open => !open && setEditing(null)} onSaved={() => void reload()} />
        </div>
    )
}

function OrgChartSkeleton() {
    return (
        <div className="@container space-y-4">
            <Skeleton className="h-3 w-80 max-w-full" />
            <div className="hidden min-h-64 flex-col items-center gap-10 rounded-lg border border-border p-8 @xl:flex">
                <NodeSkeleton />
                <div className="flex gap-6">
                    <NodeSkeleton />
                    <NodeSkeleton />
                </div>
            </div>
            <div className="space-y-2 @xl:hidden">
                {[0, 1, 2, 3].map(index => (
                    <div key={index} className="flex items-center gap-2.5 py-1.5" style={{ paddingLeft: `${[0, 1, 2, 1][index] * 1.25 + 2}rem` }}>
                        <Skeleton className="size-7 rounded-md" />
                        <div className="flex-1 space-y-1.5">
                            <Skeleton className="h-3.5 w-28" />
                            <Skeleton className="h-3 w-20" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

function NodeSkeleton() {
    return (
        <div className={`${PANEL_CARD} flex w-56 flex-col gap-2 p-3`}>
            <div className="flex items-center gap-2.5">
                <Skeleton className="size-9 rounded-md" />
                <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-24" />
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-3 w-16" />
                </div>
            </div>
            <div className="flex justify-between border-t border-border/60 pt-2">
                <Skeleton className="h-4 w-12 rounded-full" />
                <Skeleton className="h-3 w-14" />
            </div>
        </div>
    )
}
