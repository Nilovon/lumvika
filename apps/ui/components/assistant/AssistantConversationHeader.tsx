'use client'

import type { AssistantChat } from '@lumvika/contracts'
import { Badge } from '@lumvika/ui/primitives'
import { useTranslations } from 'next-intl'

import type { AssistantProjectOption } from '@/app/api/_actions/assistant.actions'
import { AssistantChatMenu } from '@/components/assistant/AssistantChatMenu'
import { AssistantProjectPicker } from '@/components/assistant/AssistantProjectPicker'
import { Button } from '@/components/ui/button'
import type { AssistantChatAccess } from '@/app/api/_services/work/assistant-chats.service'
import { ArrowLeftIcon } from '@/lib/icons'

type AssistantConversationHeaderProps = {
    chat: AssistantChat
    access: AssistantChatAccess
    projects: AssistantProjectOption[]
    onBack: () => void
    onProjectChange: (projectId: string | null) => void
    onGone: (chatId: string) => void
}

export function AssistantConversationHeader({ chat, access, projects, onBack, onProjectChange, onGone }: AssistantConversationHeaderProps) {
    const t = useTranslations('assistant')
    const owner = access === 'owner'
    return (
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2 @2xl:px-4">
            <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label={t('conversation.back')} title={t('conversation.back')} className="-ml-1 shrink-0 text-muted-foreground @2xl:hidden">
                <ArrowLeftIcon className="size-4" />
            </Button>
            <h2 className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{chat.title}</h2>
            <div className="flex min-w-0 shrink items-center gap-1.5">
                <AssistantProjectPicker projects={projects} value={chat.projectId} onChange={onProjectChange} disabled={!owner} className="max-w-[10rem] @3xl:max-w-[14rem]" />
                {owner && chat.shared && (
                    <Badge size="xs" tone="neutral" glow={false} className="shrink-0 font-medium @max-xl:hidden">
                        {t('list.sharedBadge')}
                    </Badge>
                )}
                {!owner && (
                    <Badge size="xs" tone="neutral" glow={false} className="shrink-0 font-medium">
                        {t('conversation.readOnlyBadge')}
                    </Badge>
                )}
                {owner && <AssistantChatMenu chat={chat} onGone={onGone} />}
            </div>
        </div>
    )
}
