'use client'

import { IssueDetailDialog } from '@/components/issues/IssueDetailDialog'
import { PageFrame } from '@/components/layout/PageFrame'
import { NAV_ICONS } from '@/components/layout/sidebar/nav-icons'
import { ActiveProjects } from '@/components/overview/ActiveProjects'
import { CoworkersNow } from '@/components/overview/CoworkersNow'
import { FirstRun } from '@/components/overview/FirstRun'
import { GoalsInProgress } from '@/components/overview/GoalsInProgress'
import { NeedsYouStrip } from '@/components/overview/NeedsYouStrip'
import { OverviewSkeleton } from '@/components/overview/OverviewSkeleton'
import { RecentActivity } from '@/components/overview/RecentActivity'
import { ThroughputChart } from '@/components/overview/ThroughputChart'
import { useWorkOverview } from '@/components/overview/useWorkOverview'
import { useWaitingConversations } from '@/components/review/useWaitingConversations'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { useBoardStore } from '@/stores/board.store'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

export function OverviewScreen() {
    const t = useTranslations('overview')
    const { overview, loadError, reload } = useWorkOverview()
    const waiting = useWaitingConversations()
    const coworkerCount = useBoardStore(state => state.agents.length)
    const boardHydrated = useBoardStore(state => state.hydrated)
    const [openRef, setOpenRef] = useState<string | null>(null)

    const firstRun = !!overview && boardHydrated && overview.projectCount === 0 && coworkerCount === 0

    return (
        <PageFrame title={t('title')} description={t('description')} bodyClassName="max-w-6xl">
            {!overview || !boardHydrated ? (
                loadError ? (
                    <EmptyState
                        icon={NAV_ICONS.overview}
                        title={t('loadFailed')}
                        description={loadError}
                        action={
                            <Button size="sm" variant="outline" onClick={() => void reload()}>
                                {t('retry')}
                            </Button>
                        }
                        className="py-16"
                    />
                ) : (
                    <OverviewSkeleton />
                )
            ) : firstRun ? (
                <FirstRun />
            ) : (
                <div className="@container flex flex-col gap-4">
                    <NeedsYouStrip counts={{ toReview: overview.counts.toReview, blocked: overview.counts.blocked, waiting: waiting?.length ?? null, assigned: overview.counts.assignedToMe }} />
                    <div className="grid gap-4 @4xl:grid-cols-3">
                        <div className="flex min-w-0 flex-col gap-4 @4xl:col-span-2">
                            <ThroughputChart created={overview.throughput.created} completed={overview.throughput.completed} />
                            <ActiveProjects projects={overview.activeProjects} />
                            <RecentActivity recent={overview.recent} onOpenIssue={setOpenRef} />
                        </div>
                        <div className="flex min-w-0 flex-col gap-4">
                            <CoworkersNow checkouts={overview.checkouts} />
                            <GoalsInProgress goals={overview.goals} />
                        </div>
                    </div>
                </div>
            )}
            <IssueDetailDialog issueRef={openRef} onOpenChange={open => !open && setOpenRef(null)} />
        </PageFrame>
    )
}
