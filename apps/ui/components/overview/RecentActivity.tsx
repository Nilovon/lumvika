'use client'

import type { ActivityFeedPage } from '@/app/api/_services/work/activity-feed.service'
import { ActivityEventItem } from '@/components/activity/ActivityEventItem'
import { OverviewCard } from '@/components/overview/OverviewCard'
import { useTranslations } from 'next-intl'

// The last few lines of the activity feed, each read as it is on the Activity screen.
export function RecentActivity({ recent, onOpenIssue }: { recent: ActivityFeedPage; onOpenIssue: (ref: string) => void }) {
    const t = useTranslations('overview.recent')
    return (
        <OverviewCard title={t('title')} link={{ href: '/activity', label: t('all') }}>
            {recent.events.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t('empty')}</p>
            ) : (
                <ul className="-my-1 divide-y divide-border/60">
                    {recent.events.map(event => (
                        <ActivityEventItem key={event.id} event={event} refs={recent.refs} onOpenIssue={onOpenIssue} relative />
                    ))}
                </ul>
            )}
        </OverviewCard>
    )
}
