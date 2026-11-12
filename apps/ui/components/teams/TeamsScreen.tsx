'use client'

import { PageFrame } from '@/components/layout/PageFrame'
import { NAV_ICONS } from '@/components/layout/sidebar/nav-icons'
import { EmptyState } from '@/components/ui/empty-state'
import { useTranslations } from 'next-intl'

// Placeholder until the teams feature lands: the route, the frame and the strings are in place.
export function TeamsScreen() {
    const t = useTranslations('teams')
    return (
        <PageFrame title={t('title')} description={t('description')}>
            <EmptyState icon={NAV_ICONS.teams} title={t('empty.title')} description={t('empty.description')} className="py-16" />
        </PageFrame>
    )
}
