'use client'

import type { AssistantChat } from '@lumvika/contracts'
import { useTranslations } from 'next-intl'
import { useMemo, useState, type ReactNode } from 'react'

import type { AssistantHome } from '@/app/api/_actions/assistant.actions'
import { AssistantChatRow } from '@/components/assistant/AssistantChatRow'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { groupByRecency, matchesQuery } from '@/lib/assistant/recency-groups'
import { MessagePlusIcon, SearchIcon } from '@/lib/icons'
import { cn } from '@/lib/utils'

type AssistantChatListProps = {
    home: AssistantHome | null
    activeChatId: string | null
    onOpen: (chatId: string) => void
    onNew: () => void
    onGone: (chatId: string) => void
    className?: string
}

export function AssistantChatList({ home, activeChatId, onOpen, onNew, onGone, className }: AssistantChatListProps) {
    const t = useTranslations('assistant.list')
    const [query, setQuery] = useState('')
    const [showArchived, setShowArchived] = useState(false)

    const mine = useMemo(() => groupByRecency((home?.mine ?? []).filter(chat => matchesQuery(chat, query))), [home?.mine, query])
    const shared = useMemo(() => (home?.shared ?? []).filter(chat => matchesQuery(chat, query)), [home?.shared, query])
    const archived = useMemo(() => (home?.archived ?? []).filter(chat => matchesQuery(chat, query)), [home?.archived, query])
    const nothing = home && mine.length === 0 && shared.length === 0
    const row = (chat: AssistantChat, ownerName?: string | null) => <AssistantChatRow key={chat.id} chat={chat} active={chat.id === activeChatId} ownerName={ownerName} onOpen={onOpen} onGone={onGone} />

    return (
        <nav aria-label={t('label')} className={cn('flex min-h-0 flex-col', className)}>
            <div className="flex shrink-0 flex-col gap-2 p-3">
                <Button variant="outline" onClick={onNew} className="w-full justify-start">
                    <MessagePlusIcon className="size-4" />
                    {t('new')}
                </Button>
                <div className="relative">
                    <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t('search')} aria-label={t('search')} className="pl-8" />
                </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-6">
                {!home ? (
                    <AssistantChatListSkeleton />
                ) : (
                    <>
                        {nothing && <p className="px-2.5 py-6 text-sm text-muted-foreground">{query.trim() ? t('noResults', { query: query.trim() }) : t('empty')}</p>}
                        {mine.map(({ group, chats }) => (
                            <ChatGroup key={group} title={t(`groups.${group}`)}>
                                {chats.map(chat => row(chat))}
                            </ChatGroup>
                        ))}
                        {shared.length > 0 && <ChatGroup title={t('groups.shared')}>{shared.map(chat => row(chat, home.owners[chat.userId] ?? null))}</ChatGroup>}
                        {archived.length > 0 && (
                            <div className="mt-4 px-1">
                                <Button variant="ghost" size="sm" onClick={() => setShowArchived(open => !open)} aria-expanded={showArchived} className="text-muted-foreground">
                                    {showArchived ? t('hideArchived') : t('showArchived', { count: archived.length })}
                                </Button>
                                {showArchived && <ChatGroup title={t('groups.archived')}>{archived.map(chat => row(chat))}</ChatGroup>}
                            </div>
                        )}
                    </>
                )}
            </div>
        </nav>
    )
}

function ChatGroup({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section className="mt-3 first:mt-0">
            <h2 className="px-2.5 pb-1 text-xs font-medium text-muted-foreground">{title}</h2>
            <ul className="flex flex-col gap-0.5">{children}</ul>
        </section>
    )
}

function AssistantChatListSkeleton() {
    const widths = ['w-3/4', 'w-1/2', 'w-2/3', 'w-5/6', 'w-3/5']
    return (
        <div aria-hidden className="flex flex-col gap-0.5">
            <Skeleton className="mx-2.5 mb-2 h-3 w-16" />
            {widths.map(width => (
                <div key={width} className="flex min-h-10 items-center px-2.5 py-2">
                    <Skeleton className={cn('h-3.5', width)} />
                </div>
            ))}
        </div>
    )
}
