'use client'

import type { WorkAuthor, WorkMemberRef } from '@lumvika/contracts'
import { Badge } from '@lumvika/ui/primitives'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useState } from 'react'

import type { ChannelDetail } from '@/app/api/_actions/channels.actions'
import { ChannelLinkFields, useChannelLinkOptions, type ChannelLinkValue } from '@/components/channels/ChannelLinkFields'
import { MemberAvatar } from '@/components/channels/MemberAvatar'
import { SidePaneHeader } from '@/components/channels/SidePaneHeader'
import { refKey } from '@/components/channels/channel-rows'
import type { ChannelDirectory } from '@/components/channels/useChannelDirectory'
import { ConfirmDialog } from '@/components/dialogs/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { ArchiveIcon, LogOutIcon, PencilIcon, PlusIcon, XIcon } from '@/lib/icons'

type ChannelDetailsPanelProps = {
    detail: ChannelDetail
    me: WorkAuthor | null
    directory: ChannelDirectory
    authorName: (author: WorkAuthor) => string
    onClose: () => void
    onEdit: () => void
    onAddMembers: () => void
    onRemove: (member: WorkMemberRef) => Promise<void>
    onLeave: () => Promise<void>
    onArchive: () => Promise<void>
    onLink: (links: Partial<ChannelLinkValue>) => Promise<void>
}

type Confirming = { kind: 'remove'; member: WorkMemberRef } | { kind: 'leave' } | { kind: 'archive' } | null

// What a channel is, who is in it, what it links to, and the moves on it: add or remove members
// (public: anyone adds; private: its manager), leave, archive.
export function ChannelDetailsPanel({ detail, me, directory, authorName, onClose, onEdit, onAddMembers, onRemove, onLeave, onArchive, onLink }: ChannelDetailsPanelProps) {
    const t = useTranslations('channels.details')
    const [confirming, setConfirming] = useState<Confirming>(null)
    const [pending, setPending] = useState(false)
    const manages = detail.access === 'manage'
    const isDm = detail.kind === 'dm'
    const canAdd = !isDm && !detail.archivedAt && (detail.kind === 'public' ? detail.isMember || manages : manages)
    const canLink = manages && !isDm && !detail.archivedAt
    const linkOptions = useChannelLinkOptions(canLink)
    const [linking, setLinking] = useState(false)
    const link = async (links: Partial<ChannelLinkValue>) => {
        setLinking(true)
        await onLink(links)
        setLinking(false)
    }

    const run = async (action: () => Promise<void>) => {
        setPending(true)
        await action()
        setPending(false)
        setConfirming(null)
    }

    const people = detail.members.filter(row => row.member.kind === 'user')
    const coworkers = detail.members.filter(row => row.member.kind === 'agent')
    const confirmName = confirming?.kind === 'remove' ? authorName(confirming.member) : ''

    return (
        <section className="flex min-h-0 flex-1 flex-col" aria-label={t('title')}>
            <SidePaneHeader title={t('title')} onClose={onClose} closeLabel={t('close')} backLabel={t('back')} />
            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4">
                <section className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                        <h3 className="text-xs font-medium text-muted-foreground">{t('about')}</h3>
                        <Badge size="xs" tone="neutral" glow={false} className="font-medium">
                            {t(`kind.${detail.kind}`)}
                        </Badge>
                    </div>
                    <p className="text-sm break-words whitespace-pre-wrap text-foreground">{detail.description || <span className="text-muted-foreground">{t('noDescription')}</span>}</p>
                    {manages && !isDm && !detail.archivedAt && (
                        <Button type="button" variant="outline" size="sm" onClick={onEdit}>
                            <PencilIcon /> {t('edit')}
                        </Button>
                    )}
                </section>

                {canLink ? (
                    <section className="space-y-3">
                        <h3 className="text-xs font-medium text-muted-foreground">{t('linked')}</h3>
                        <ChannelLinkFields idPrefix="channel-link" value={{ projectId: detail.projectId, teamId: detail.teamId }} options={linkOptions} disabled={linking} onChange={next => void link(next)} />
                    </section>
                ) : (detail.project || detail.team) && (
                    <section className="space-y-2">
                        <h3 className="text-xs font-medium text-muted-foreground">{t('linked')}</h3>
                        {detail.project && (
                            <Link href={`/projects/${encodeURIComponent(detail.project.key)}`} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted">
                                <span className="truncate">{detail.project.name}</span>
                                <span className="shrink-0 text-xs text-muted-foreground">{t('project')}</span>
                            </Link>
                        )}
                        {detail.team && (
                            <Link href="/teams" className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted">
                                <span className="truncate">{detail.team.name}</span>
                                <span className="shrink-0 text-xs text-muted-foreground">{t('team')}</span>
                            </Link>
                        )}
                    </section>
                )}

                <section className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                        <h3 className="text-xs font-medium text-muted-foreground">
                            {t('members')} · {detail.members.length}
                        </h3>
                        {canAdd && (
                            <Button type="button" variant="ghost" size="sm" onClick={onAddMembers}>
                                <PlusIcon /> {t('addMembers')}
                            </Button>
                        )}
                    </div>
                    <ul className="space-y-0.5">
                        {[...people, ...coworkers].map(row => {
                            const isMe = !!me && refKey(me) === refKey(row.member)
                            return (
                                <li key={row.id} className="flex min-h-10 items-center gap-2.5 rounded-md px-1.5 py-1 hover:bg-muted/50">
                                    <MemberAvatar author={row.member} directory={directory} />
                                    <span className="min-w-0 flex-1 truncate text-sm">{isMe ? t('you') : authorName(row.member)}</span>
                                    {row.member.kind === 'agent' && (
                                        <Badge size="xs" tone="neutral" glow={false} className="shrink-0 font-medium">
                                            {t('coworker')}
                                        </Badge>
                                    )}
                                    {manages && !isDm && !isMe && !detail.archivedAt && (
                                        <Button type="button" variant="ghost" size="icon-xs" aria-label={t('removeLabel', { name: authorName(row.member) })} onClick={() => setConfirming({ kind: 'remove', member: row.member })}>
                                            <XIcon />
                                        </Button>
                                    )}
                                </li>
                            )
                        })}
                    </ul>
                    {detail.kind !== 'public' && coworkers.length > 0 && <p className="text-xs text-muted-foreground/70">{t('coworkersReadHere', { count: coworkers.length })}</p>}
                </section>

                {!isDm && (detail.isMember || manages) && (
                    <section className="space-y-2 border-t border-border pt-4">
                        {detail.isMember && (
                            <Button type="button" variant="ghost" size="sm" className="w-full justify-start" onClick={() => setConfirming({ kind: 'leave' })}>
                                <LogOutIcon /> {t('leave')}
                            </Button>
                        )}
                        {manages && !detail.archivedAt && (
                            <Button type="button" variant="ghost" size="sm" className="w-full justify-start text-destructive hover:text-destructive" onClick={() => setConfirming({ kind: 'archive' })}>
                                <ArchiveIcon /> {t('archive')}
                            </Button>
                        )}
                    </section>
                )}
            </div>

            <ConfirmDialog
                open={confirming?.kind === 'remove'}
                onOpenChange={open => !open && setConfirming(null)}
                title={t('removeTitle', { name: confirmName, channel: detail.name })}
                description={t('removeDescription', { name: confirmName })}
                confirmLabel={t('removeConfirm')}
                pending={pending}
                onConfirm={event => {
                    event.preventDefault()
                    if (confirming?.kind === 'remove') void run(() => onRemove(confirming.member))
                }}
            />
            <ConfirmDialog
                open={confirming?.kind === 'leave'}
                onOpenChange={open => !open && setConfirming(null)}
                title={t('leaveTitle', { name: detail.name })}
                description={t('leaveDescription')}
                confirmLabel={t('leaveConfirm')}
                pending={pending}
                onConfirm={event => {
                    event.preventDefault()
                    void run(onLeave)
                }}
            />
            <ConfirmDialog
                open={confirming?.kind === 'archive'}
                onOpenChange={open => !open && setConfirming(null)}
                title={t('archiveTitle', { name: detail.name })}
                description={t('archiveDescription')}
                confirmLabel={t('archiveConfirm')}
                pending={pending}
                onConfirm={event => {
                    event.preventDefault()
                    void run(onArchive)
                }}
            />
        </section>
    )
}
