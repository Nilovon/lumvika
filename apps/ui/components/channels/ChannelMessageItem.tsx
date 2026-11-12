'use client'

import type { ChannelMessage, WorkAuthor, WorkMemberRef } from '@lumvika/contracts'
import { useLocale, useTranslations } from 'next-intl'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'

import { deleteChannelMessageAction, editChannelMessageAction } from '@/app/api/_actions/channels.actions'
import { ChannelMarkdown } from '@/components/channels/ChannelMarkdown'
import { MemberAvatar } from '@/components/channels/MemberAvatar'
import { MessageActions, useLongPress } from '@/components/channels/MessageActions'
import { MessageEditor } from '@/components/channels/MessageEditor'
import { refKey } from '@/components/channels/channel-rows'
import type { ChannelDirectory } from '@/components/channels/useChannelDirectory'
import type { StreamMessage } from '@/components/channels/useChannelMessages'
import { ConfirmDialog } from '@/components/dialogs/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { useErrorText } from '@/hooks/useErrorText'
import type { ComposerMention } from '@/lib/chat/composer-links'
import { messageTime } from '@/lib/time'
import { cn } from '@/lib/utils'

type ChannelMessageItemProps = {
    message: StreamMessage
    // A follow-up of the same author: no avatar nor name, the time shows on hover.
    continued: boolean
    me: WorkAuthor | null
    canManage: boolean
    directory: ChannelDirectory
    authorName: (author: WorkAuthor) => string
    tokens: ComposerMention[]
    mentionsOf: (body: string) => WorkMemberRef[]
    onReply?: () => void
    onChanged: (message: ChannelMessage) => void
    onRetry?: (clientId: string) => void
    onDiscard?: (clientId: string) => void
    // Under the words: the thread summary, a coworker answering, a failure note.
    footer?: ReactNode
}

export function ChannelMessageItem({ message, continued, me, canManage, directory, authorName, tokens, mentionsOf, onReply, onChanged, onRetry, onDiscard, footer }: ChannelMessageItemProps) {
    const t = useTranslations('channels.message')
    const locale = useLocale()
    const errorText = useErrorText()
    const [menuOpen, setMenuOpen] = useState(false)
    const [editing, setEditing] = useState(false)
    const [saving, setSaving] = useState(false)
    const [confirmingDelete, setConfirmingDelete] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const longPress = useLongPress(() => setMenuOpen(true))

    const landed = !message.sendState
    const mine = !!me && refKey(me) === refKey(message.author)
    const live = landed && !message.deletedAt
    const time = messageTime(message.createdAt, locale)

    const save = async (body: string) => {
        setSaving(true)
        const result = await editChannelMessageAction(message.id, { body, mentions: mentionsOf(body) })
        setSaving(false)
        if (!result.ok) return void toast.error(errorText(result))
        onChanged(result.message)
        setEditing(false)
    }

    const remove = async () => {
        setDeleting(true)
        const result = await deleteChannelMessageAction(message.id)
        setDeleting(false)
        if (!result.ok) return void toast.error(errorText(result))
        onChanged(result.message)
        setConfirmingDelete(false)
    }

    return (
        <div
            className={cn('group/message relative flex gap-2.5 rounded-md px-2 py-1 select-text [@media(hover:hover)]:hover:bg-muted/40', !continued && 'mt-2', menuOpen && 'bg-muted/40')}
            data-message-id={message.id}
            {...(live ? longPress : {})}
        >
            <div className="w-8 shrink-0">
                {continued ? (
                    <time dateTime={message.createdAt} className="hidden pt-0.5 text-right text-[10px] leading-5 text-muted-foreground tabular-nums group-hover/message:block">
                        {time}
                    </time>
                ) : (
                    <MemberAvatar author={message.author} directory={directory} className="mt-0.5" />
                )}
            </div>
            <div className="min-w-0 flex-1">
                {!continued && (
                    <div className="flex min-w-0 items-baseline gap-2">
                        <span className="truncate text-sm font-medium text-foreground">{authorName(message.author)}</span>
                        <time dateTime={message.createdAt} className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                            {time}
                        </time>
                    </div>
                )}
                {message.deletedAt ? (
                    <p className="text-sm text-muted-foreground italic">{t('deleted')}</p>
                ) : editing ? (
                    <MessageEditor initialBody={message.body} saving={saving} onSave={body => void save(body)} onCancel={() => setEditing(false)} />
                ) : (
                    <div className={cn(message.sendState === 'sending' && 'opacity-60')}>
                        <ChannelMarkdown body={message.body} mentions={tokens} />
                        {message.editedAt && <span className="text-[11px] text-muted-foreground">{t('edited')}</span>}
                    </div>
                )}
                {message.sendState === 'failed' && message.clientId && (
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-destructive">
                        <span>{t('notSent')}</span>
                        <Button type="button" size="xs" variant="outline" onClick={() => onRetry?.(message.clientId!)}>
                            {t('retry')}
                        </Button>
                        <Button type="button" size="xs" variant="ghost" onClick={() => onDiscard?.(message.clientId!)}>
                            {t('cancel')}
                        </Button>
                    </div>
                )}
                {message.sendState === 'sending' && <p className="text-[11px] text-muted-foreground">{t('sending')}</p>}
                {footer}
            </div>
            {live && !editing && (
                <MessageActions
                    open={menuOpen}
                    onOpenChange={setMenuOpen}
                    onReply={onReply}
                    onEdit={mine ? () => setEditing(true) : undefined}
                    onDelete={mine || canManage ? () => setConfirmingDelete(true) : undefined}
                />
            )}
            <ConfirmDialog
                open={confirmingDelete}
                onOpenChange={setConfirmingDelete}
                title={t('deleteTitle')}
                description={t('deleteDescription')}
                confirmLabel={t('delete')}
                pending={deleting}
                onConfirm={event => {
                    event.preventDefault()
                    void remove()
                }}
            />
        </div>
    )
}
