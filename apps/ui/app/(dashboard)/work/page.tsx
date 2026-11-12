import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { MyWorkScreen } from '@/components/work/MyWorkScreen'
import { requirePlatformAccess } from '@/lib/shell/platform-access.server'

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('work')
    return { title: t('title') }
}

export default async function MyWorkPage() {
    await requirePlatformAccess()
    return <MyWorkScreen />
}
