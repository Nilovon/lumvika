import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { ReviewScreen } from '@/components/review/ReviewScreen'
import { requirePlatformAccess } from '@/lib/shell/platform-access.server'

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('review')
    return { title: t('title') }
}

export default async function ReviewPage() {
    await requirePlatformAccess()
    return <ReviewScreen />
}
