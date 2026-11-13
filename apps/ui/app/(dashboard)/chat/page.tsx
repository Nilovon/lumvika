import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { AssistantScreen } from '@/components/assistant/AssistantScreen'
import { requirePlatformAccess } from '@/lib/shell/platform-access.server'

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('assistant')
    return { title: t('title') }
}

export default async function ChatPage() {
    await requirePlatformAccess()
    return <AssistantScreen />
}
