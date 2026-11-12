'use client'

import type { AssistantChat } from '@lumvika/contracts'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useState } from 'react'

import type { AssistantProjectOption } from '@/app/api/_actions/assistant.actions'
import { AssistantChatList } from '@/components/assistant/AssistantChatList'
import { AssistantConversation } from '@/components/assistant/AssistantConversation'
import { AssistantStateNotice } from '@/components/assistant/AssistantStateNotice'
import { useAssistantStore } from '@/components/assistant/useAssistantStore'
import { useChatRoute } from '@/components/assistant/useChatRoute'
import { PageFrame } from '@/components/layout/PageFrame'
import { Button } from '@/components/ui/button'
import { ArrowLeftIcon } from '@/lib/icons'
import { cn } from '@/lib/utils'

const NO_PROJECTS: AssistantProjectOption[] = []

// The plain Chat area: the person's chats on the left, one conversation on the right. On a phone the
// two are separate views, the conversation with a way back to the list. `chatId` is the segment of
// `/chat/[chatId]` the page was opened on; the screen follows the URL from there.
export function AssistantScreen({ chatId }: { chatId?: string }) {
    const t = useTranslations('assistant')
    const { route, go } = useChatRoute(chatId)
    const home = useAssistantStore(state => state.home)
    const load = useAssistantStore(state => state.load)
    const upsert = useAssistantStore(state => state.upsert)

    useEffect(() => {
        void load()
    }, [load])

    // The chat the open draft just turned into keeps the same pane, so its first answer keeps
    // streaming while the URL takes its id. `draft` changes for every new chat started.
    const [createdId, setCreatedId] = useState<string | null>(null)
    const [draft, setDraft] = useState(0)
    const openChatId = route.kind === 'chat' && route.chatId !== createdId ? route.chatId : null
    const activeChatId = route.kind === 'chat' ? route.chatId : null

    const openChat = useCallback((chatId: string) => go({ kind: 'chat', chatId }), [go])
    const startNew = useCallback(() => {
        setCreatedId(null)
        setDraft(n => n + 1)
        go({ kind: 'new' })
    }, [go])
    const backToList = useCallback(() => go({ kind: 'index' }), [go])
    const onCreated = useCallback(
        (chat: AssistantChat) => {
            setCreatedId(chat.id)
            upsert(chat)
            go({ kind: 'chat', chatId: chat.id }, { replace: true })
        },
        [go, upsert]
    )
    const onGone = useCallback(
        (chatId: string) => {
            if (chatId === activeChatId) go({ kind: 'index' }, { replace: true })
        },
        [activeChatId, go]
    )

    const blocker = home && home.availability !== 'ready' ? home.availability : null
    const inConversation = route.kind !== 'index'

    return (
        <PageFrame title={t('title')} description={t('description')} bleed>
            <div className="@container flex h-full min-h-0">
                <AssistantChatList
                    home={home}
                    activeChatId={activeChatId}
                    onOpen={openChat}
                    onNew={startNew}
                    onGone={onGone}
                    className={cn('w-full shrink-0 border-border @2xl:w-64 @2xl:border-r @5xl:w-72', inConversation && '@max-2xl:hidden')}
                />
                <section className={cn('flex min-h-0 min-w-0 flex-1 flex-col', !inConversation && '@max-2xl:hidden')}>
                    {blocker ? (
                        <>
                            {inConversation && (
                                <div className="flex shrink-0 items-center border-b border-border px-3 py-2 @2xl:hidden">
                                    <Button variant="ghost" size="sm" onClick={backToList} className="-ml-1 text-muted-foreground">
                                        <ArrowLeftIcon className="size-4" />
                                        {t('conversation.back')}
                                    </Button>
                                </div>
                            )}
                            <AssistantStateNotice blocker={blocker} onRetry={() => void load()} />
                        </>
                    ) : (
                        <AssistantConversation key={openChatId ? `chat-${openChatId}` : `draft-${draft}`} chatId={openChatId} projects={home?.projects ?? NO_PROJECTS} isAdmin={home?.isAdmin ?? false} onCreated={onCreated} onBack={backToList} onNew={startNew} onGone={onGone} />
                    )}
                </section>
            </div>
        </PageFrame>
    )
}
