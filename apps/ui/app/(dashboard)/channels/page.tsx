import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { ChannelsScreen } from '@/components/channels/ChannelsScreen'
import { requirePlatformAccess } from '@/lib/shell/platform-access.server'

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('channels')
    return { title: t('title') }
}

export default async function ChannelsPage() {
    await requirePlatformAccess()
    return <ChannelsScreen />
}
