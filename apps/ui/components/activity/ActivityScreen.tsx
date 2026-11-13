'use client'

import { listProjectsAction } from '@/app/api/_actions/projects.actions'
import { groupByDay } from '@/components/activity/activity-feed'
import { ActivityEventItem } from '@/components/activity/ActivityEventItem'
import { ActivityFilters, hasActivityFilters, NO_ACTIVITY_FILTERS, type ActivityFilterState } from '@/components/activity/ActivityFilters'
import { ActivitySkeleton } from '@/components/activity/ActivitySkeleton'
import { useActivityFeed } from '@/components/activity/useActivityFeed'
import { IssueDetailDialog } from '@/components/issues/IssueDetailDialog'
import { PageFrame } from '@/components/layout/PageFrame'
import { NAV_ICONS } from '@/components/layout/sidebar/nav-icons'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { FilterIcon } from '@/lib/icons'
import { localDayKey } from '@/lib/work/throughput'
import type { ProjectSummary } from '@lumvika/contracts'
import { messageDayLabel } from '@lumvika/i18n/format'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useMemo, useState } from 'react'

export function ActivityScreen() {
    const t = useTranslations('activity')
    const locale = useLocale()
    const [filters, setFilters] = useState<ActivityFilterState>(NO_ACTIVITY_FILTERS)
    const [projects, setProjects] = useState<ProjectSummary[]>([])
    const [openRef, setOpenRef] = useState<string | null>(null)
    const query = useMemo(() => ({ projectIds: filters.projectIds, actorKind: filters.actorKinds.length === 1 ? filters.actorKinds[0] : undefined, entityTypes: filters.entityTypes }), [filters])
    const { feed, loadError, loadingMore, loadMore, reload } = useActivityFeed(query)

    useEffect(() => {
        let active = true
        void listProjectsAction().then(result => {
            if (active && result.ok) setProjects(result.projects)
        })
        return () => {
            active = false
        }
    }, [])

    const days = useMemo(() => groupByDay(feed?.events ?? [], iso => localDayKey(new Date(iso))), [feed])
    const filtered = hasActivityFilters(filters)

    return (
        <PageFrame title={t('title')} description={t('description')} width="readable">
            <div className="flex flex-col gap-5">
                <ActivityFilters filters={filters} onChange={setFilters} projects={projects} />
                {feed === null ? (
                    <ActivitySkeleton />
                ) : loadError && feed.events.length === 0 ? (
                    <EmptyState
                        icon={NAV_ICONS.activity}
                        title={t('loadFailed')}
                        description={loadError}
                        action={
                            <Button size="sm" variant="outline" onClick={() => void reload()}>
                                {t('retry')}
                            </Button>
                        }
                        className="py-16"
                    />
                ) : feed.events.length === 0 ? (
                    filtered ? (
                        <EmptyState
                            icon={FilterIcon}
                            title={t('noMatch.title')}
                            description={t('noMatch.description')}
                            action={
                                <Button size="sm" variant="outline" onClick={() => setFilters(NO_ACTIVITY_FILTERS)}>
                                    {t('filters.clear')}
                                </Button>
                            }
                            className="rounded-lg border border-dashed border-border py-12"
                        />
                    ) : (
                        <EmptyState icon={NAV_ICONS.activity} title={t('empty.title')} description={t('empty.description')} className="py-16" />
                    )
                ) : (
                    <div className="flex flex-col gap-6">
                        {days.map(day => (
                            <section key={day.day} aria-labelledby={`activity-day-${day.day}`} className="flex flex-col gap-1">
                                <h2 id={`activity-day-${day.day}`} className="sticky top-0 z-10 -mx-1 bg-background/95 px-1 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
                                    {messageDayLabel(day.events[0].createdAt, locale)}
                                </h2>
                                <ul className="divide-y divide-border/60">
                                    {day.events.map(event => (
                                        <ActivityEventItem key={event.id} event={event} refs={feed.refs} onOpenIssue={setOpenRef} />
                                    ))}
                                </ul>
                            </section>
                        ))}
                        <div className="flex justify-center">
                            {feed.nextCursor ? (
                                <Button type="button" size="sm" variant="outline" onClick={() => void loadMore()} loading={loadingMore}>
                                    {t('loadMore')}
                                </Button>
                            ) : (
                                <p className="text-xs text-muted-foreground">{t('end')}</p>
                            )}
                        </div>
                    </div>
                )}
            </div>
            <IssueDetailDialog issueRef={openRef} onOpenChange={open => !open && setOpenRef(null)} />
        </PageFrame>
    )
}
