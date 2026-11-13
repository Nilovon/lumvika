import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { OverviewScreen } from '@/components/overview/OverviewScreen'
import { requirePlatformAccess } from '@/lib/shell/platform-access.server'

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('overview')
    return { title: t('title') }
}

export default async function OverviewPage() {
    await requirePlatformAccess()
    return <OverviewScreen />
}
