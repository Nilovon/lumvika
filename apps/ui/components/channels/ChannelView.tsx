'use client'

import type { WorkAuthor, WorkMemberRef } from '@lumvika/contracts'
import { useTranslations } from 'next-intl'
import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { addChannelMembersAction, archiveChannelAction, joinChannelAction, leaveChannelAction, removeChannelMemberAction } from '@/app/api/_actions/channels.actions'
import type { ChannelListItem } from '@/app/api/_services/work/channels.service'
import { ChannelComposer } from '@/components/channels/ChannelComposer'
import { ChannelDetailsPanel } from '@/components/channels/ChannelDetailsPanel'
import { ChannelFormDialog } from '@/components/channels/ChannelFormDialog'
import { ChannelHeader } from '@/components/channels/ChannelHeader'
import { MemberPickerDialog } from '@/components/channels/MemberPickerDialog'
import { personEntries } from '@/components/channels/picker-entries'
import { MessageStream, MessageStreamSkeleton } from '@/components/channels/MessageStream'
import { OutsiderPrompt, type OutsiderOffer } from '@/components/channels/OutsiderPrompt'
import { ThreadPane } from '@/components/channels/ThreadPane'
import { refKey } from '@/components/channels/channel-rows'
import { useAuthorName } from '@/components/channels/useAuthorName'
import type { ChannelDirectory } from '@/components/channels/useChannelDirectory'
import { useChannelDetail } from '@/components/channels/useChannelDetail'
import { mentionCandidates, mentionsIn, mentionTokensIn } from '@/components/channels/useChannelMentions'
import { useChannelMessages } from '@/components/channels/useChannelMessages'
import type { ChannelSidePane } from '@/components/channels/useChannelRoute'
import { useMarkChannelRead } from '@/components/channels/useMarkChannelRead'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { useErrorText } from '@/hooks/useErrorText'
import { HashIcon, MessageSquareIcon } from '@/lib/icons'
import { cn } from '@/lib/utils'

type ChannelViewProps = {
    channelId: string
    listItem: ChannelListItem | undefined
    userId: string | null
    side: ChannelSidePane
    directory: ChannelDirectory
    onNavigate: (channelId: string | null, side?: ChannelSidePane) => void
    onListChanged: () => void
}

// One conversation: the stream and its composer, with its thread or its details beside it on a wide
// screen, in its place on a narrow one.
export function ChannelView({ channelId, listItem, userId, side, directory, onNavigate, onListChanged }: ChannelViewProps) {
    const t = useTranslations('channels')
    const errorText = useErrorText()
    const authorName = useAuthorName(directory)
    const me = useMemo<WorkAuthor | null>(() => (userId ? { kind: 'user', userId } : null), [userId])
    const { detail, status: detailStatus, reload: reloadDetail } = useChannelDetail(channelId)
    const stream = useChannelMessages(channelId, me)
    const [offers, setOffers] = useState<OutsiderOffer[]>([])
    const [editing, setEditing] = useState(false)
    const [adding, setAdding] = useState(false)

    const memberRefs = useMemo(() => detail?.members.map(row => row.member) ?? [], [detail])
    const candidates = useMemo(() => mentionCandidates(directory, memberRefs, t('message.unnamed')), [directory, memberRefs, t])
    const tokensOf = useCallback((body: string) => mentionTokensIn(body, candidates), [candidates])
    const mentionsOf = useCallback((body: string) => mentionsIn(body, candidates), [candidates])

    const dmPeer = detail?.kind === 'dm' ? (memberRefs.find(ref => !me || refKey(ref) !== refKey(me)) ?? null) : null
    const title = detail ? (detail.kind === 'dm' ? (dmPeer ? authorName(dmPeer) : t('channel.dmTitle')) : detail.name) : (listItem?.name ?? '')
    const canManage = detail?.access === 'manage'
    const archived = !!detail?.archivedAt
    const canPost = !!detail && !archived && detail.isMember

    useMarkChannelRead(channelId, !!detail?.isMember && stream.status === 'ready', stream.activityAt, stream.messages.length)

    const openSide = (next: ChannelSidePane) => onNavigate(channelId, next)
    const closeSide = () => onNavigate(channelId, null)

    const addOutsider = async (offer: OutsiderOffer) => {
        const result = await addChannelMembersAction(channelId, [{ kind: 'agent', agentId: offer.agentId }], offer.messageId)
        if (!result.ok) {
            toast.error(errorText(result, t('coworker.addFailed')))
            return false
        }
        return true
    }

    const join = async () => {
        const result = await joinChannelAction(channelId)
        if (!result.ok) return void toast.error(errorText(result))
        await reloadDetail()
        onListChanged()
    }

    const leave = async () => {
        const result = await leaveChannelAction(channelId)
        if (!result.ok) return void toast.error(errorText(result))
        toast.success(t('toasts.left', { name: title }))
        onListChanged()
        onNavigate(null)
    }

    const archive = async () => {
        const result = await archiveChannelAction(channelId)
        if (!result.ok) return void toast.error(errorText(result))
        toast.success(t('toasts.archived', { name: title }))
        onListChanged()
        onNavigate(null)
    }

    const remove = async (member: WorkMemberRef) => {
        const result = await removeChannelMemberAction(channelId, member)
        if (!result.ok) return void toast.error(errorText(result))
        await reloadDetail()
    }

    const addMember = async (ref: WorkMemberRef) => {
        const result = await addChannelMembersAction(channelId, [ref])
        if (!result.ok) return void toast.error(errorText(result))
        await reloadDetail()
    }

    if (detailStatus === 'missing' || stream.status === 'missing') {
        return (
            <section className="flex min-w-0 flex-1 flex-col">
                <ChannelHeader detail={null} title="" dmPeer={null} directory={directory} detailsOpen={false} onBack={() => onNavigate(null)} onToggleDetails={() => {}} />
                <EmptyState icon={HashIcon} title={t('channel.notFoundTitle')} description={t('channel.notFoundDescription')} className="py-16" />
            </section>
        )
    }

    const listProps = { me, canManage, directory, authorName, tokensOf, mentionsOf, onChanged: stream.replace, onRetry: (clientId: string) => void stream.retry(clientId), onDiscard: stream.discard }
    const isDmWithCoworker = dmPeer?.kind === 'agent'
    const empty = detail ? (
        <EmptyState
            icon={detail.kind === 'dm' ? MessageSquareIcon : HashIcon}
            title={detail.kind === 'dm' ? t('channel.dmEmptyTitle', { name: title }) : t('channel.emptyTitle', { name: detail.name })}
            description={detail.kind === 'dm' ? (isDmWithCoworker ? t('channel.dmCoworkerEmptyDescription', { name: title }) : t('channel.dmEmptyDescription')) : t('channel.emptyDescription')}
            className="py-16"
        />
    ) : null

    return (
        <>
            <section className={cn('min-w-0 flex-1 flex-col', side ? 'hidden @5xl:flex' : 'flex')} aria-label={title}>
                <ChannelHeader detail={detail} title={title} dmPeer={dmPeer} directory={directory} detailsOpen={side?.kind === 'details'} onBack={() => onNavigate(null)} onToggleDetails={() => openSide(side?.kind === 'details' ? null : { kind: 'details' })} />
                {stream.status === 'loading' || !detail ? (
                    <MessageStreamSkeleton />
                ) : stream.status === 'failed' ? (
                    <EmptyState icon={HashIcon} title={t('channel.loadFailed')} action={<Button size="sm" variant="outline" onClick={() => void stream.reload()}>{t('channel.retry')}</Button>} className="py-16" />
                ) : (
                    <MessageStream
                        {...listProps}
                        channelKind={detail.kind}
                        messages={stream.messages}
                        turns={stream.turns}
                        hasOlder={!!stream.nextCursor}
                        loadingOlder={stream.loadingOlder}
                        onLoadOlder={() => void stream.loadOlder()}
                        onOpenThread={rootId => openSide({ kind: 'thread', rootId })}
                        empty={empty}
                    />
                )}
                <div className="shrink-0 border-t border-border p-2 @2xl:p-3">
                    {archived ? (
                        <p className="px-1 py-2 text-center text-xs text-muted-foreground">{t('channel.archived')}</p>
                    ) : detail && !detail.isMember ? (
                        <div className="flex flex-wrap items-center justify-center gap-3 px-1 py-1.5">
                            <p className="text-xs text-muted-foreground">{t('channel.preview', { name: detail.name })}</p>
                            <Button type="button" size="sm" onClick={() => void join()}>
                                {t('channel.join')}
                            </Button>
                        </div>
                    ) : canPost ? (
                        <>
                            <OutsiderPrompt offers={offers} directory={directory} onAdd={addOutsider} onDismiss={agentId => setOffers(current => current.filter(offer => offer.agentId !== agentId))} />
                            <ChannelComposer
                                uid={`channel:${channelId}`}
                                placeholder={detail.kind === 'dm' ? t('composer.dmPlaceholder', { name: title }) : t('composer.placeholder', { name: detail.name })}
                                candidates={candidates}
                                directory={directory}
                                onSend={draft =>
                                    void stream.send(draft).then(posted => {
                                        if (posted && posted.outsiders.length > 0) setOffers(posted.outsiders.map(outsider => ({ agentId: outsider.id, messageId: posted.message.id, canAdd: posted.canAddOutsiders })))
                                    })
                                }
                            />
                        </>
                    ) : (
                        <div className="h-24" />
                    )}
                </div>
            </section>

            {side && detail && (
                <aside className="flex min-w-0 flex-1 flex-col @5xl:w-80 @5xl:flex-none @5xl:border-l @5xl:border-border">
                    {side.kind === 'thread' ? (
                        <ThreadPane key={side.rootId} {...listProps} channelId={channelId} rootId={side.rootId} turns={stream.turns} canPost={canPost} candidates={candidates} onClose={closeSide} onAddOutsider={addOutsider} />
                    ) : (
                        <ChannelDetailsPanel detail={detail} me={me} directory={directory} authorName={authorName} onClose={closeSide} onEdit={() => setEditing(true)} onAddMembers={() => setAdding(true)} onRemove={remove} onLeave={leave} onArchive={archive} />
                    )}
                </aside>
            )}

            {detail && detail.kind !== 'dm' && (
                <>
                    <ChannelFormDialog
                        open={editing}
                        onOpenChange={setEditing}
                        channel={detail}
                        onSaved={() => {
                            setEditing(false)
                            void reloadDetail()
                            onListChanged()
                        }}
                    />
                    <MemberPickerDialog
                        open={adding}
                        onOpenChange={setAdding}
                        title={t('picker.addTitle', { name: detail.name })}
                        description={t('picker.addDescription')}
                        people={directory.people ? personEntries(directory.people, t('message.unnamed')) : null}
                        coworkers={directory.coworkers.filter(coworker => coworker.reachable).map(coworker => ({ ref: { kind: 'agent' as const, agentId: coworker.id }, name: coworker.name, hint: coworker.handle ? `@${coworker.handle}` : undefined }))}
                        directory={directory}
                        taken={new Set(memberRefs.map(refKey))}
                        onPick={addMember}
                    />
                </>
            )}
        </>
    )
}
