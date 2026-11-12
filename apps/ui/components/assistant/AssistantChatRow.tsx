'use client'

import type { AssistantChat } from '@lumvika/contracts'
import { useTranslations } from 'next-intl'

import { AssistantChatMenu } from '@/components/assistant/AssistantChatMenu'
import { Badge } from '@lumvika/ui/primitives'
import { cn } from '@/lib/utils'

type AssistantChatRowProps = {
    chat: AssistantChat
    active: boolean
    // Set on a chat someone else shared: its owner's name replaces the menu, which is theirs.
    ownerName?: string | null
    onOpen: (chatId: string) => void
    onGone: (chatId: string) => void
}

export function AssistantChatRow({ chat, active, ownerName, onOpen, onGone }: AssistantChatRowProps) {
    const t = useTranslations('assistant.list')
    const shared = ownerName !== undefined
    return (
        <li className={cn('group/chat relative flex items-center rounded-md transition-colors', active ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60')}>
            <button type="button" onClick={() => onOpen(chat.id)} aria-current={active ? 'page' : undefined} className="flex min-h-10 min-w-0 flex-1 flex-col justify-center gap-0.5 py-2 pr-1 pl-2.5 text-left">
                <span className="truncate text-sm leading-tight">{chat.title}</span>
                {shared && <span className="truncate text-xs text-muted-foreground">{t('sharedBy', { name: ownerName || t('someone') })}</span>}
            </button>
            {!shared && chat.shared && (
                <Badge size="xs" tone="neutral" glow={false} className="mr-1 shrink-0 font-medium">
                    {t('sharedBadge')}
                </Badge>
            )}
            {!shared && <AssistantChatMenu chat={chat} onGone={onGone} className={cn('mr-1 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/chat:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100 [@media(hover:hover)]:data-[state=open]:opacity-100', active && '[@media(hover:hover)]:opacity-100')} />}
        </li>
    )
}
