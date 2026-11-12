'use client'

import type { WorkAuthor } from '@lumvika/contracts'
import { useTranslations } from 'next-intl'
import { Fragment, useState } from 'react'

import type { ChannelAgentTurn } from '@/app/api/_services/work/channel-coworkers.service'
import { Conversation, ConversationContent, ConversationScrollButton } from '@/components/ai-elements/conversation'
import { ChannelComposer } from '@/components/channels/ChannelComposer'
import { ChannelMessageItem } from '@/components/channels/ChannelMessageItem'
import { continuesFrom, MessageStreamSkeleton, type MessageListProps } from '@/components/channels/MessageStream'
import { SidePaneHeader } from '@/components/channels/SidePaneHeader'
import { TurnNote } from '@/components/channels/TurnNote'
import { isAnswering } from '@/components/channels/channel-rows'
import type { MentionCandidate } from '@/components/channels/useChannelMentions'
import { useChannelThread } from '@/components/channels/useChannelThread'
import { OutsiderPrompt, type OutsiderOffer } from '@/components/channels/OutsiderPrompt'
import { EmptyState } from '@/components/ui/empty-state'
import { MessageSquareIcon } from '@/lib/icons'

type ThreadPaneProps = MessageListProps & {
    channelId: string
    rootId: string
    turns: ChannelAgentTurn[]
    canPost: boolean
    candidates: MentionCandidate[]
    onClose: () => void
    onAddOutsider: (offer: OutsiderOffer) => Promise<boolean>
    me: WorkAuthor | null
}

// A thread beside the channel (on a phone, in its place): its first message, the replies, what the
// coworkers it summoned are doing, and a composer that answers in it.
export function ThreadPane({ channelId, rootId, turns, canPost, candidates, onClose, onAddOutsider, ...item }: ThreadPaneProps) {
    const t = useTranslations('channels.thread')
    const tComposer = useTranslations('channels.composer')
    const thread = useChannelThread(channelId, rootId, item.me)
    const [offers, setOffers] = useState<OutsiderOffer[]>([])
    const threadTurns = turns.filter(turn => turn.threadMessageId === rootId && (isAnswering(turn) || turn.status === 'failed'))
    const notesAfter = (messageId: string) => threadTurns.filter(turn => turn.triggerMessageId === messageId)

    const all = thread.root ? [{ ...thread.root, thread: null }, ...thread.replies] : []

    return (
        <section className="flex min-h-0 flex-1 flex-col" aria-label={t('title')}>
            <SidePaneHeader title={t('title')} onClose={onClose} closeLabel={t('close')} backLabel={t('back')} />
            {thread.status === 'loading' ? (
                <MessageStreamSkeleton />
            ) : thread.status === 'missing' || !thread.root ? (
                <EmptyState icon={MessageSquareIcon} title={t('gone')} className="py-16" />
            ) : (
                <Conversation className="min-h-0">
                    <ConversationContent className="gap-0 px-2 pt-3 pb-4">
                        {all.map((message, index) => (
                            <Fragment key={message.clientId ?? message.id}>
                                <ChannelMessageItem
                                    {...item}
                                    message={message}
                                    continued={index > 1 && continuesFrom(all[index - 1], message)}
                                    onChanged={thread.replace}
                                    onRetry={clientId => void thread.retry(clientId)}
                                    onDiscard={thread.discard}
                                    footer={notesAfter(message.id).map(turn => (
                                        <TurnNote key={turn.id} turn={turn} coworkerName={item.authorName({ kind: 'agent', agentId: turn.agentId })} />
                                    ))}
                                />
                                {index === 0 && (
                                    <div className="my-2 flex items-center gap-3 px-2" role="separator">
                                        <span className="text-[11px] font-medium text-muted-foreground">{t('replies', { count: thread.replies.filter(reply => !reply.deletedAt).length })}</span>
                                        <span className="h-px flex-1 bg-border" />
                                    </div>
                                )}
                            </Fragment>
                        ))}
                    </ConversationContent>
                    <ConversationScrollButton />
                </Conversation>
            )}
            {canPost && thread.status === 'ready' && (
                <div className="shrink-0 border-t border-border p-2 @2xl:p-3">
                    <OutsiderPrompt offers={offers} directory={item.directory} onAdd={onAddOutsider} onDismiss={agentId => setOffers(current => current.filter(offer => offer.agentId !== agentId))} />
                    <ChannelComposer
                        uid={`channel:${channelId}:thread:${rootId}`}
                        placeholder={tComposer('threadPlaceholder')}
                        candidates={candidates}
                        directory={item.directory}
                        onSend={draft =>
                            void thread.send(draft).then(posted => {
                                if (posted && posted.outsiders.length > 0) setOffers(posted.outsiders.map(outsider => ({ agentId: outsider.id, messageId: posted.message.id, canAdd: posted.canAddOutsiders })))
                            })
                        }
                    />
                </div>
            )}
        </section>
    )
}
