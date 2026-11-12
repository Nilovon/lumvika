'use client'

import { useTranslations } from 'next-intl'

import type { AssistantAvailability } from '@/app/api/_services/assistant-engine.service'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { RefreshCwIcon, ServerIcon, Settings2Icon } from '@/lib/icons'
import { useWorkspaceSettingsStore } from '@/stores/workspace-settings.store'

export type AssistantBlocker = Exclude<AssistantAvailability, 'ready'> | 'no_provider'

// What stands between the person and a working Chat, in place of a composer that could only fail.
export function AssistantStateNotice({ blocker, onRetry }: { blocker: AssistantBlocker; onRetry: () => void }) {
    const t = useTranslations('assistant.states')
    const openAiProviders = useWorkspaceSettingsStore(state => state.openAiProviders)

    if (blocker === 'no_provider') {
        return (
            <EmptyState
                icon={Settings2Icon}
                title={t('noProvider.title')}
                description={t('noProvider.description')}
                action={
                    <Button size="sm" onClick={() => openAiProviders()}>
                        {t('noProvider.cta')}
                    </Button>
                }
            />
        )
    }
    if (blocker === 'unreachable') {
        return (
            <EmptyState
                icon={ServerIcon}
                title={t('unreachable.title')}
                description={t('unreachable.description')}
                action={
                    <Button size="sm" variant="outline" onClick={onRetry}>
                        <RefreshCwIcon className="size-4" />
                        {t('unreachable.retry')}
                    </Button>
                }
            />
        )
    }
    const copy = blocker === 'outdated' ? 'outdated' : 'noEngine'
    return <EmptyState icon={ServerIcon} title={t(`${copy}.title`)} description={t(`${copy}.description`)} />
}
