import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { ChannelsScreen } from '@/components/channels/ChannelsScreen'
import { requirePlatformAccess } from '@/lib/shell/platform-access.server'

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('channels')
    return { title: t('title') }
}

export default async function ChannelPage({ params }: { params: Promise<{ channelId: string }> }) {
    await requirePlatformAccess()
    const { channelId } = await params
    return <ChannelsScreen channelId={channelId} />
}
