import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { GoalsScreen } from '@/components/goals/GoalsScreen'
import { requirePlatformAccess } from '@/lib/shell/platform-access.server'

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('goals')
    return { title: t('title') }
}

export default async function GoalsPage() {
    await requirePlatformAccess()
    return <GoalsScreen />
}
