'use client'

import { PageFrame } from '@/components/layout/PageFrame'
import { NAV_ICONS } from '@/components/layout/sidebar/nav-icons'
import { EmptyState } from '@/components/ui/empty-state'
import { useTranslations } from 'next-intl'

// Placeholder until the assistant feature lands: the route, the frame and the strings are in place.
// `chatId` is the segment of `/chat/[chatId]`, absent on `/chat`.
export function AssistantScreen({ chatId }: { chatId?: string }) {
    const t = useTranslations('assistant')
    return (
        <PageFrame title={t('title')} description={t('description')} back={chatId ? { href: '/chat', label: t('detail.back') } : undefined}>
            <EmptyState icon={NAV_ICONS.chat} title={t('empty.title')} description={t('empty.description')} className="py-16" />
        </PageFrame>
    )
}
