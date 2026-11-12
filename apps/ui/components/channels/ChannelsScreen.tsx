'use client'

import { PageFrame } from '@/components/layout/PageFrame'
import { NAV_ICONS } from '@/components/layout/sidebar/nav-icons'
import { EmptyState } from '@/components/ui/empty-state'
import { useTranslations } from 'next-intl'

// Placeholder until the channels feature lands: the route, the frame and the strings are in place.
// `channelId` is the segment of `/channels/[channelId]`, absent on `/channels`.
export function ChannelsScreen({ channelId }: { channelId?: string }) {
    const t = useTranslations('channels')
    return (
        <PageFrame title={t('title')} description={t('description')} back={channelId ? { href: '/channels', label: t('detail.back') } : undefined}>
            <EmptyState icon={NAV_ICONS.channels} title={t('empty.title')} description={t('empty.description')} className="py-16" />
        </PageFrame>
    )
}
