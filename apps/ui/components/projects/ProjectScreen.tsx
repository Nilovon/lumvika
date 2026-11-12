'use client'

import { PageFrame } from '@/components/layout/PageFrame'
import { NAV_ICONS } from '@/components/layout/sidebar/nav-icons'
import { EmptyState } from '@/components/ui/empty-state'
import { useTranslations } from 'next-intl'

// Placeholder until the projects feature lands. `projectKey` is the segment of `/projects/[projectKey]`.
export function ProjectScreen({ projectKey }: { projectKey: string }) {
    const t = useTranslations('projects')
    return (
        <PageFrame title={projectKey} back={{ href: '/projects', label: t('detail.back') }}>
            <EmptyState icon={NAV_ICONS.projects} title={t('empty.title')} description={t('empty.description')} className="py-16" />
        </PageFrame>
    )
}
