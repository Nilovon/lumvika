'use client'

import type { ChannelKind, ChannelMessage, WorkAuthor, WorkMemberRef } from '@lumvika/contracts'
import { useLocale, useTranslations } from 'next-intl'
import { Fragment, type ReactNode } from 'react'

import type { ChannelAgentTurn } from '@/app/api/_services/work/channel-coworkers.service'
import { Conversation, ConversationContent, ConversationScrollButton } from '@/components/ai-elements/conversation'
import { ChannelMessageItem } from '@/components/channels/ChannelMessageItem'
import { ThreadSummary } from '@/components/channels/ThreadSummary'
import { TurnNote } from '@/components/channels/TurnNote'
import { isAnswering, refKey } from '@/components/channels/channel-rows'
import type { ChannelDirectory } from '@/components/channels/useChannelDirectory'
import type { StreamMessage } from '@/components/channels/useChannelMessages'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { ComposerMention } from '@/lib/chat/composer-links'
import { messageDayLabel } from '@/lib/time'

const GROUP_WINDOW_MS = 5 * 60_000

export type MessageListProps = {
    me: WorkAuthor | null
    canManage: boolean
    directory: ChannelDirectory
    authorName: (author: WorkAuthor) => string
    tokens: ComposerMention[]
    mentionsOf: (body: string) => WorkMemberRef[]
    onChanged: (message: ChannelMessage) => void
    onRetry: (clientId: string) => void
    onDiscard: (clientId: string) => void
}

type MessageStreamProps = MessageListProps & {
    channelKind: ChannelKind
    messages: StreamMessage[]
    turns: ChannelAgentTurn[]
    hasOlder: boolean
    loadingOlder: boolean
    onLoadOlder: () => void
    onOpenThread: (rootId: string) => void
    empty: ReactNode
}

function dayKey(iso: string): string {
    const date = new Date(iso)
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

// Whether a message follows the one before it closely enough to read as the same turn of speech.
export function continuesFrom(previous: StreamMessage | undefined, message: StreamMessage): boolean {
    if (!previous || previous.deletedAt || previous.thread) return false
    if (refKey(previous.author) !== refKey(message.author)) return false
    if (dayKey(previous.createdAt) !== dayKey(message.createdAt)) return false
    return new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime() < GROUP_WINDOW_MS
}

export function DayDivider({ iso }: { iso: string }) {
    const locale = useLocale()
    return (
        <div className="my-3 flex items-center gap-3 px-2" role="separator">
            <span className="h-px flex-1 bg-border" />
            <time dateTime={iso} className="text-[11px] font-medium text-muted-foreground">
                {messageDayLabel(iso, locale)}
            </time>
            <span className="h-px flex-1 bg-border" />
        </div>
    )
}

// The channel itself: top-level messages grouped by author and day, each with the way into its thread
// and what the coworkers it summoned are doing.
export function MessageStream({ channelKind, messages, turns, hasOlder, loadingOlder, onLoadOlder, onOpenThread, empty, ...item }: MessageStreamProps) {
    const t = useTranslations('channels.channel')
    // A deleted message nobody answered leaves no trace in the channel.
    const shown = messages.filter(message => !message.deletedAt || message.thread)

    const notesFor = (message: StreamMessage) =>
        turns.filter(turn => {
            if (channelKind === 'dm') return turn.triggerMessageId === message.id && (isAnswering(turn) || turn.status === 'failed')
            if (isAnswering(turn)) return turn.threadMessageId === message.id
            return turn.status === 'failed' && turn.triggerMessageId === message.id
        })

    return (
        <Conversation className="min-h-0">
            <ConversationContent className="gap-0 px-2 pt-4 pb-6 @2xl:px-4">
                {hasOlder && (
                    <div className="flex justify-center pb-2">
                        <Button type="button" variant="ghost" size="sm" loading={loadingOlder} onClick={onLoadOlder}>
                            {t('loadOlder')}
                        </Button>
                    </div>
                )}
                {shown.length === 0 && !hasOlder ? empty : null}
                {shown.map((message, index) => {
                    const previous = shown[index - 1]
                    const newDay = !previous || dayKey(previous.createdAt) !== dayKey(message.createdAt)
                    const notes = notesFor(message)
                    return (
                        <Fragment key={message.clientId ?? message.id}>
                            {newDay && <DayDivider iso={message.createdAt} />}
                            <ChannelMessageItem
                                {...item}
                                message={message}
                                continued={!newDay && continuesFrom(previous, message) && notesFor(previous).length === 0}
                                onReply={channelKind === 'dm' && !message.thread ? undefined : () => onOpenThread(message.id)}
                                footer={
                                    message.thread || notes.length > 0 ? (
                                        <>
                                            {message.thread && <ThreadSummary thread={message.thread} directory={item.directory} onOpen={() => onOpenThread(message.id)} />}
                                            {notes.map(turn => (
                                                <TurnNote key={turn.id} turn={turn} coworkerName={item.authorName({ kind: 'agent', agentId: turn.agentId })} />
                                            ))}
                                        </>
                                    ) : null
                                }
                            />
                        </Fragment>
                    )
                })}
            </ConversationContent>
            <ConversationScrollButton />
        </Conversation>
    )
}

const SKELETON_LINES = ['w-3/4', 'w-1/2', 'w-2/3', 'w-5/6', 'w-2/5']

// The shape of the stream: author rows with an avatar, a name and one or two lines.
export function MessageStreamSkeleton() {
    return (
        <div className="flex flex-1 flex-col justify-end gap-4 overflow-hidden px-4 pt-4 pb-6" aria-hidden>
            {SKELETON_LINES.map((width, index) => (
                <div key={width} className="flex gap-2.5 px-2">
                    <Skeleton className="size-8 shrink-0 rounded-full" />
                    <div className="min-w-0 flex-1 space-y-1.5 pt-0.5">
                        <Skeleton className="h-3.5 w-28" />
                        <Skeleton className={`h-3.5 ${width}`} />
                        {index % 2 === 0 && <Skeleton className="h-3.5 w-1/3" />}
                    </div>
                </div>
            ))}
        </div>
    )
}
