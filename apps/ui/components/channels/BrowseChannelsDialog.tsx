'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import type { ChannelListItem } from '@/app/api/_services/work/channels.service'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { HashIcon } from '@/lib/icons'

type BrowseChannelsDialogProps = {
    open: boolean
    onOpenChange: (open: boolean) => void
    channels: ChannelListItem[]
    onOpen: (channelId: string) => void
    onJoin: (channelId: string) => Promise<boolean>
}

// Every public channel of the workspace: open one to read it first, or join it straight away.
export function BrowseChannelsDialog({ open, onOpenChange, channels, onOpen, onJoin }: BrowseChannelsDialogProps) {
    const t = useTranslations('channels.browse')
    const [joining, setJoining] = useState<string | null>(null)
    const publicChannels = channels.filter(channel => channel.kind === 'public')

    return (
        <Dialog open={open} onOpenChange={onOpenChange} asSheet={false}>
            <DialogContent className="gap-3 p-0 sm:max-w-lg">
                <DialogHeader className="px-4 pt-4">
                    <DialogTitle>{t('title')}</DialogTitle>
                    <DialogDescription>{t('description')}</DialogDescription>
                </DialogHeader>
                <Command className="rounded-none! px-2 pb-2">
                    <CommandInput placeholder={t('search')} />
                    <CommandList className="max-h-[min(24rem,60dvh)]">
                        <CommandEmpty>{t('empty')}</CommandEmpty>
                        {publicChannels.map(channel => (
                            <CommandItem key={channel.id} value={`${channel.name} ${channel.description ?? ''}`} onSelect={() => onOpen(channel.id)} className="items-start gap-2.5 py-2">
                                <HashIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-medium">{channel.name}</span>
                                    {channel.description && <span className="line-clamp-2 text-xs text-muted-foreground">{channel.description}</span>}
                                </span>
                                {channel.isMember ? (
                                    <span className="shrink-0 pt-0.5 text-xs text-muted-foreground">{t('joined')}</span>
                                ) : (
                                    <Button
                                        type="button"
                                        size="xs"
                                        variant="outline"
                                        className="shrink-0"
                                        loading={joining === channel.id}
                                        onClick={async event => {
                                            event.stopPropagation()
                                            setJoining(channel.id)
                                            const joined = await onJoin(channel.id)
                                            setJoining(null)
                                            if (joined) onOpen(channel.id)
                                        }}
                                    >
                                        {t('join')}
                                    </Button>
                                )}
                            </CommandItem>
                        ))}
                    </CommandList>
                </Command>
            </DialogContent>
        </Dialog>
    )
}
