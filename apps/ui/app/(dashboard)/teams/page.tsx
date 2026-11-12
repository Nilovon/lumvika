import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { TeamsScreen } from '@/components/teams/TeamsScreen'
import { requirePlatformAccess } from '@/lib/shell/platform-access.server'

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('teams')
    return { title: t('title') }
}

export default async function TeamsPage() {
    await requirePlatformAccess()
    return <TeamsScreen />
}
