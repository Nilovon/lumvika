'use client'

import type { AssistantChat } from '@lumvika/contracts'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { openAssistantChatAction, type AssistantProjectOption, type OpenedAssistantChat } from '@/app/api/_actions/assistant.actions'
import { AssistantThread } from '@/components/assistant/AssistantThread'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonChat } from '@/components/ui/skeleton'
import { Skeleton } from '@lumvika/ui/primitives'
import { MessageSquareIcon } from '@/lib/icons'

type AssistantConversationProps = {
    // Null for a chat not started yet.
    chatId: string | null
    projects: AssistantProjectOption[]
    isAdmin: boolean
    onCreated: (chat: AssistantChat) => void
    onBack: () => void
    onNew: () => void
    onGone: (chatId: string) => void
}

type Loaded = { chatId: string; opened: OpenedAssistantChat | null }

// A chat read from the server before its thread mounts: the thread starts from its transcript and
// from the run still in flight on it, if any.
export function AssistantConversation({ chatId, ...thread }: AssistantConversationProps) {
    const t = useTranslations('assistant.conversation.notFound')
    const [loaded, setLoaded] = useState<Loaded | null>(null)

    useEffect(() => {
        if (!chatId) return
        let live = true
        void openAssistantChatAction(chatId).then(result => {
            if (live) setLoaded({ chatId, opened: result.ok ? result.opened : null })
        })
        return () => {
            live = false
        }
    }, [chatId])

    if (!chatId) return <AssistantThread opened={null} {...thread} />
    if (loaded?.chatId !== chatId) return <AssistantConversationSkeleton />
    if (!loaded.opened) {
        return (
            <EmptyState
                icon={MessageSquareIcon}
                title={t('title')}
                description={t('description')}
                action={
                    <Button size="sm" variant="outline" onClick={thread.onNew}>
                        {t('cta')}
                    </Button>
                }
            />
        )
    }
    return <AssistantThread opened={loaded.opened} {...thread} />
}

function AssistantConversationSkeleton() {
    return (
        <div aria-hidden className="flex min-h-0 flex-1 flex-col">
            <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-3 @2xl:px-4">
                <Skeleton className="h-3.5 w-48" />
                <Skeleton className="ml-auto h-7 w-24 rounded-full" />
            </div>
            <div className="mx-auto w-full max-w-3xl flex-1 px-4 pt-6">
                <SkeletonChat />
            </div>
        </div>
    )
}
