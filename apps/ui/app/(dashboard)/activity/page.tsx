import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { ActivityScreen } from '@/components/activity/ActivityScreen'
import { requirePlatformAccess } from '@/lib/shell/platform-access.server'

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('activity')
    return { title: t('title') }
}

export default async function ActivityPage() {
    await requirePlatformAccess()
    return <ActivityScreen />
}
