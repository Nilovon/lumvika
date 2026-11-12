'use client'

import type { WorkMemberRef } from '@lumvika/contracts'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import type { ChannelListItem } from '@/app/api/_services/work/channels.service'
import { MemberAvatar } from '@/components/channels/MemberAvatar'
import type { ChannelDirectory } from '@/components/channels/useChannelDirectory'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { HashIcon, LockIcon, MessagePlusIcon, PlusIcon, SearchIcon } from '@/lib/icons'
import { cn } from '@/lib/utils'

type ChannelListProps = {
    channels: ChannelListItem[] | null
    failed: boolean
    activeChannelId: string | null
    userId: string | null
    directory: ChannelDirectory
    dmPeerName: (peer: WorkMemberRef | null) => string
    onSelect: (channelId: string) => void
    onNewChannel: () => void
    onBrowse: () => void
    onNewMessage: () => void
    onRetry: () => void
}

export function dmPeerOf(channel: ChannelListItem, userId: string | null): WorkMemberRef | null {
    return channel.dmMembers.find(member => member.kind !== 'user' || member.userId !== userId) ?? null
}

function SectionHeader({ title, children }: { title: string; children: ReactNode }) {
    return (
        <div className="flex h-8 items-center gap-1 px-2">
            <h2 className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">{title}</h2>
            {children}
        </div>
    )
}

function IconAction({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button type="button" variant="ghost" size="icon-xs" aria-label={label} onClick={onClick} className="text-muted-foreground">
                    {children}
                </Button>
            </TooltipTrigger>
            <TooltipContent side="top">{label}</TooltipContent>
        </Tooltip>
    )
}

function Row({ active, unread, label, onClick, leading, unreadLabel }: { active: boolean; unread: number; label: string; onClick: () => void; leading: ReactNode; unreadLabel: string }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-current={active ? 'page' : undefined}
            className={cn(
                'flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm transition-colors md:min-h-8',
                active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                unread > 0 && !active && 'font-medium text-foreground'
            )}
        >
            {leading}
            <span className="min-w-0 flex-1 truncate">{label}</span>
            {unread > 0 && (
                <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-foreground px-1 text-[10px] font-medium text-background tabular-nums" aria-label={unreadLabel}>
                    {unread > 99 ? '99+' : unread}
                </span>
            )}
        </button>
    )
}

// The left column: the channels the person is in, then their direct messages, each with its unread
// count, and the ways to start something new.
export function ChannelList({ channels, failed, activeChannelId, userId, directory, dmPeerName, onSelect, onNewChannel, onBrowse, onNewMessage, onRetry }: ChannelListProps) {
    const t = useTranslations('channels.list')
    const joined = (channels ?? []).filter(channel => channel.kind !== 'dm' && (channel.isMember || channel.id === activeChannelId))
    const directMessages = (channels ?? []).filter(channel => channel.kind === 'dm').sort((a, b) => (b.lastMessage?.createdAt ?? b.createdAt).localeCompare(a.lastMessage?.createdAt ?? a.createdAt))

    return (
        <nav aria-label={t('label')} className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 py-3">
            <SectionHeader title={t('channels')}>
                <IconAction label={t('browse')} onClick={onBrowse}>
                    <SearchIcon />
                </IconAction>
                <IconAction label={t('newChannel')} onClick={onNewChannel}>
                    <PlusIcon />
                </IconAction>
            </SectionHeader>
            {failed && !channels ? (
                <div className="space-y-2 px-2 py-3 text-xs text-muted-foreground">
                    <p>{t('loadFailed')}</p>
                    <Button type="button" size="xs" variant="outline" onClick={onRetry}>
                        {t('retry')}
                    </Button>
                </div>
            ) : !channels ? (
                <ChannelListSkeleton />
            ) : (
                <div className="space-y-0.5">
                    {joined.map(channel => (
                        <Row
                            key={channel.id}
                            active={channel.id === activeChannelId}
                            unread={channel.unreadCount}
                            unreadLabel={t('unread', { count: channel.unreadCount })}
                            label={channel.name}
                            onClick={() => onSelect(channel.id)}
                            leading={channel.kind === 'private' ? <LockIcon className="size-3.5 shrink-0" aria-label={t('privateChannel')} /> : <HashIcon className="size-3.5 shrink-0" aria-label={t('publicChannel')} />}
                        />
                    ))}
                </div>
            )}

            <div className="mt-5">
                <SectionHeader title={t('directMessages')}>
                    <IconAction label={t('newMessage')} onClick={onNewMessage}>
                        <MessagePlusIcon />
                    </IconAction>
                </SectionHeader>
                {channels && directMessages.length === 0 && <p className="px-2 py-1.5 text-xs text-muted-foreground">{t('noDirectMessages')}</p>}
                <div className="space-y-0.5">
                    {directMessages.map(channel => {
                        const peer = dmPeerOf(channel, userId)
                        return (
                            <Row
                                key={channel.id}
                                active={channel.id === activeChannelId}
                                unread={channel.unreadCount}
                                unreadLabel={t('unread', { count: channel.unreadCount })}
                                label={dmPeerName(peer)}
                                onClick={() => onSelect(channel.id)}
                                leading={peer ? <MemberAvatar author={peer} directory={directory} size="sm" className="-ml-1" /> : <HashIcon className="size-3.5 shrink-0" />}
                            />
                        )
                    })}
                </div>
            </div>
        </nav>
    )
}

const SKELETON_WIDTHS = ['w-24', 'w-32', 'w-20', 'w-28']

function ChannelListSkeleton() {
    return (
        <div className="space-y-0.5" aria-hidden>
            {SKELETON_WIDTHS.map(width => (
                <div key={width} className="flex min-h-9 items-center gap-2 px-2 md:min-h-8">
                    <Skeleton className="size-3.5 rounded-sm" />
                    <Skeleton className={cn('h-3.5', width)} />
                </div>
            ))}
        </div>
    )
}
