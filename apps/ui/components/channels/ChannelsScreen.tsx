'use client'

import type { WorkMemberRef } from '@lumvika/contracts'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { joinChannelAction, openDirectMessageAction } from '@/app/api/_actions/channels.actions'
import { BrowseChannelsDialog } from '@/components/channels/BrowseChannelsDialog'
import { ChannelFormDialog } from '@/components/channels/ChannelFormDialog'
import { ChannelList } from '@/components/channels/ChannelList'
import { ChannelView } from '@/components/channels/ChannelView'
import { MemberPickerDialog } from '@/components/channels/MemberPickerDialog'
import { personEntries } from '@/components/channels/picker-entries'
import { useAuthorName } from '@/components/channels/useAuthorName'
import { useChannelDirectory } from '@/components/channels/useChannelDirectory'
import { useChannelList } from '@/components/channels/useChannelList'
import { useChannelRoute, type ChannelSidePane } from '@/components/channels/useChannelRoute'
import { PageFrame } from '@/components/layout/PageFrame'
import { EmptyState } from '@/components/ui/empty-state'
import { useErrorText } from '@/hooks/useErrorText'
import { HashIcon } from '@/lib/icons'
import { cn } from '@/lib/utils'

type Dialog = 'create' | 'browse' | 'dm' | null

// The width of the screen's own frame (the steward column and the sidebar take their share of the
// window) from which the list and the conversation sit side by side: `@2xl` below.
const TWO_PANES_MIN_PX = 672

// Channels: the list on the left, the open conversation in the middle, its thread or details on the
// right. A tablet shows two of them, a phone one at a time, each with its way back. `channelId` is
// the segment of `/channels/[channelId]`; once mounted the screen follows the URL itself.
export function ChannelsScreen({ channelId: initialChannelId }: { channelId?: string }) {
    const t = useTranslations('channels')
    const errorText = useErrorText()
    const { channelId, side, go } = useChannelRoute(initialChannelId)
    const { channels, userId, failed, reload } = useChannelList(channelId)
    const directory = useChannelDirectory()
    const authorName = useAuthorName(directory)
    const [dialog, setDialog] = useState<Dialog>(null)
    const frameRef = useRef<HTMLDivElement>(null)

    const navigate = useCallback((next: string | null, nextSide: ChannelSidePane = null) => go(next, nextSide), [go])

    // With room for two panes, the first channel opens on its own rather than leaving the middle empty.
    useEffect(() => {
        if (channelId || !channels || (frameRef.current?.offsetWidth ?? 0) < TWO_PANES_MIN_PX) return
        const first = channels.find(channel => channel.kind !== 'dm' && channel.isMember) ?? channels[0]
        if (first) go(first.id, null, true)
    }, [channelId, channels, go])

    const dmPeerName = (peer: WorkMemberRef | null) => (peer ? authorName(peer) : t('channel.dmTitle'))

    const startDm = async (ref: WorkMemberRef) => {
        const result = await openDirectMessageAction(ref)
        if (!result.ok) return void toast.error(errorText(result))
        setDialog(null)
        void reload()
        navigate(result.channel.id)
    }

    const join = async (id: string) => {
        const result = await joinChannelAction(id)
        if (!result.ok) {
            toast.error(errorText(result))
            return false
        }
        void reload()
        return true
    }

    const listItem = channels?.find(channel => channel.id === channelId)

    return (
        <PageFrame title={t('title')} description={t('description')} bleed>
            <div ref={frameRef} className="@container flex h-full min-h-0">
                <div className={cn('min-h-0 w-full flex-col border-border @2xl:flex @2xl:w-60 @2xl:shrink-0 @2xl:border-r', channelId ? 'hidden' : 'flex')}>
                    <ChannelList
                        channels={channels}
                        failed={failed}
                        activeChannelId={channelId}
                        userId={userId}
                        directory={directory}
                        dmPeerName={dmPeerName}
                        onSelect={id => navigate(id)}
                        onNewChannel={() => setDialog('create')}
                        onBrowse={() => setDialog('browse')}
                        onNewMessage={() => setDialog('dm')}
                        onRetry={() => void reload()}
                    />
                </div>
                {channelId ? (
                    <ChannelView key={channelId} channelId={channelId} listItem={listItem} userId={userId} side={side} directory={directory} onNavigate={navigate} onListChanged={() => void reload()} />
                ) : (
                    <section className="hidden min-w-0 flex-1 @2xl:flex">
                        <EmptyState icon={HashIcon} title={t('channel.selectTitle')} description={t('channel.selectDescription')} />
                    </section>
                )}
            </div>

            <ChannelFormDialog
                open={dialog === 'create'}
                onOpenChange={open => setDialog(open ? 'create' : null)}
                onSaved={channel => {
                    setDialog(null)
                    void reload()
                    navigate(channel.id)
                }}
            />
            <BrowseChannelsDialog
                open={dialog === 'browse'}
                onOpenChange={open => setDialog(open ? 'browse' : null)}
                channels={channels ?? []}
                onJoin={join}
                onOpen={id => {
                    setDialog(null)
                    navigate(id)
                }}
            />
            <MemberPickerDialog
                open={dialog === 'dm'}
                onOpenChange={open => setDialog(open ? 'dm' : null)}
                title={t('picker.dmTitle')}
                description={t('picker.dmDescription')}
                people={directory.people ? personEntries(directory.people, t('message.unnamed'), userId) : null}
                coworkers={directory.coworkers.filter(coworker => coworker.reachable).map(coworker => ({ ref: { kind: 'agent' as const, agentId: coworker.id }, name: coworker.name, hint: coworker.handle ? `@${coworker.handle}` : undefined }))}
                directory={directory}
                onPick={startDm}
            />
        </PageFrame>
    )
}
