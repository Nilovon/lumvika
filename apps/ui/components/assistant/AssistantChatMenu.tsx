'use client'

import type { AssistantChat } from '@lumvika/contracts'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { AssistantRenameDialog } from '@/components/assistant/AssistantRenameDialog'
import { useAssistantChatActions } from '@/components/assistant/useAssistantChatActions'
import { ConfirmDialog } from '@/components/dialogs/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ArchiveIcon, EllipsisIcon, PencilIcon, Share2Icon, Trash2Icon } from '@/lib/icons'
import { cn } from '@/lib/utils'

type AssistantChatMenuProps = {
    chat: AssistantChat
    onGone?: (chatId: string) => void
    className?: string
}

// The owner's menu of one chat. The dialogs are mounted beside the menu, not in it: a dropdown closes
// on any click outside it, and would take a dialog opened from inside down with it.
export function AssistantChatMenu({ chat, onGone, className }: AssistantChatMenuProps) {
    const t = useTranslations('assistant')
    const { update, toggleShare, archive, destroy } = useAssistantChatActions(onGone)
    const [renaming, setRenaming] = useState(false)
    const [confirmingDelete, setConfirmingDelete] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const archived = Boolean(chat.archivedAt)

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label={t('menu.open')} title={t('menu.open')} className={cn('shrink-0 text-muted-foreground', className)} onClick={event => event.stopPropagation()}>
                        <EllipsisIcon className="size-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-auto" onClick={event => event.stopPropagation()}>
                    <DropdownMenuItem className="whitespace-nowrap" onSelect={() => setRenaming(true)}>
                        <PencilIcon /> {t('menu.rename')}
                    </DropdownMenuItem>
                    {!archived && (
                        <DropdownMenuItem className="whitespace-nowrap" onSelect={() => void toggleShare(chat)}>
                            <Share2Icon /> {chat.shared ? t('menu.unshare') : t('menu.share')}
                        </DropdownMenuItem>
                    )}
                    {archived ? (
                        <DropdownMenuItem inset className="whitespace-nowrap" onSelect={() => void archive(chat, false)}>
                            {t('menu.restore')}
                        </DropdownMenuItem>
                    ) : (
                        <DropdownMenuItem className="whitespace-nowrap" onSelect={() => void archive(chat, true)}>
                            <ArchiveIcon /> {t('menu.archive')}
                        </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" className="whitespace-nowrap" onSelect={() => setConfirmingDelete(true)}>
                        <Trash2Icon /> {t('menu.delete')}
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
            <AssistantRenameDialog open={renaming} onOpenChange={setRenaming} title={chat.title} onRename={title => update(chat, { title })} />
            <ConfirmDialog
                open={confirmingDelete}
                onOpenChange={setConfirmingDelete}
                title={t('delete.title')}
                description={t('delete.description', { title: chat.title })}
                confirmLabel={t('delete.confirm')}
                pending={deleting}
                onConfirm={async event => {
                    event.preventDefault()
                    setDeleting(true)
                    const done = await destroy(chat)
                    setDeleting(false)
                    if (done) setConfirmingDelete(false)
                }}
            />
        </>
    )
}
