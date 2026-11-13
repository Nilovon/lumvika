'use client'

import type { WorkMemberRef } from '@lumvika/contracts'
import { useTranslations } from 'next-intl'

import type { ChannelDetail } from '@/app/api/_actions/channels.actions'
import { MemberAvatar } from '@/components/channels/MemberAvatar'
import type { ChannelDirectory } from '@/components/channels/useChannelDirectory'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowLeftIcon, HashIcon, InfoIcon, LockIcon, UsersIcon } from '@/lib/icons'

type ChannelHeaderProps = {
    detail: ChannelDetail | null
    title: string
    dmPeer: WorkMemberRef | null
    directory: ChannelDirectory
    detailsOpen: boolean
    onBack: () => void
    onToggleDetails: () => void
}

// The bar over a conversation: its name, its description, its members, the way to its details, and
// on a phone the way back to the list.
export function ChannelHeader({ detail, title, dmPeer, directory, detailsOpen, onBack, onToggleDetails }: ChannelHeaderProps) {
    const t = useTranslations('channels.channel')
    return (
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-2 @2xl:px-4">
            <Button type="button" variant="ghost" size="icon-sm" className="@2xl:hidden" aria-label={t('back')} onClick={onBack}>
                <ArrowLeftIcon />
            </Button>
            {!detail ? (
                <Skeleton className="h-4 w-36" />
            ) : (
                <>
                    {detail.kind === 'dm' ? dmPeer && <MemberAvatar author={dmPeer} directory={directory} size="sm" /> : detail.kind === 'private' ? <LockIcon className="size-4 shrink-0 text-muted-foreground" /> : <HashIcon className="size-4 shrink-0 text-muted-foreground" />}
                    <div className="min-w-0 flex-1">
                        <h2 className="truncate text-sm leading-tight font-medium">{title}</h2>
                        {detail.description && <p className="hidden truncate text-xs text-muted-foreground sm:block">{detail.description}</p>}
                    </div>
                    {detail.kind !== 'dm' && (
                        <Button type="button" variant="ghost" size="sm" className="shrink-0 text-muted-foreground" aria-label={t('members', { count: detail.members.length })} onClick={onToggleDetails}>
                            <UsersIcon /> <span className="tabular-nums">{detail.members.length}</span>
                        </Button>
                    )}
                    <Button type="button" variant="ghost" size="icon-sm" aria-pressed={detailsOpen} aria-label={t('details')} title={t('details')} onClick={onToggleDetails} className={detailsOpen ? 'bg-accent' : 'text-muted-foreground'}>
                        <InfoIcon />
                    </Button>
                </>
            )}
        </header>
    )
}
