'use client'

import type { WorkMemberRef } from '@lumvika/contracts'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { MemberAvatar } from '@/components/channels/MemberAvatar'
import { refKey } from '@/components/channels/channel-rows'
import type { ChannelDirectory } from '@/components/channels/useChannelDirectory'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { CheckIcon } from '@/lib/icons'

import type { PickerEntry } from '@/components/channels/picker-entries'


type MemberPickerDialogProps = {
    open: boolean
    onOpenChange: (open: boolean) => void
    title: string
    description: string
    people: PickerEntry[] | null
    coworkers: PickerEntry[]
    directory: ChannelDirectory
    // Already there: shown as added, not offered again.
    taken?: ReadonlySet<string>
    onPick: (ref: WorkMemberRef) => Promise<void>
}

// Picks a person or a coworker by name: who to write to, who to add to a channel.
export function MemberPickerDialog({ open, onOpenChange, title, description, people, coworkers, directory, taken, onPick }: MemberPickerDialogProps) {
    const t = useTranslations('channels.picker')
    const [busy, setBusy] = useState<string | null>(null)

    const row = (entry: PickerEntry) => {
        const key = refKey(entry.ref)
        const isTaken = taken?.has(key) ?? false
        return (
            <CommandItem
                key={key}
                value={`${entry.name} ${entry.hint ?? ''} ${key}`}
                disabled={isTaken || busy !== null}
                onSelect={async () => {
                    setBusy(key)
                    await onPick(entry.ref)
                    setBusy(null)
                }}
                className="min-h-10 gap-2.5"
            >
                <MemberAvatar author={entry.ref} directory={directory} size="sm" />
                <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                {entry.hint && <span className="max-w-[40%] shrink-0 truncate text-xs text-muted-foreground">{entry.hint}</span>}
                {isTaken && (
                    <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                        <CheckIcon className="size-3.5" /> {t('added')}
                    </span>
                )}
            </CommandItem>
        )
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange} asSheet={false}>
            <DialogContent className="gap-3 p-0 sm:max-w-md">
                <DialogHeader className="px-4 pt-4">
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>
                <Command className="rounded-none! px-2 pb-2">
                    <CommandInput placeholder={t('search')} />
                    <CommandList className="max-h-[min(22rem,55dvh)]">
                        <CommandEmpty>{t('empty')}</CommandEmpty>
                        {people === null ? (
                            <div className="space-y-1 p-2" aria-hidden>
                                {[0, 1, 2].map(index => (
                                    <div key={index} className="flex items-center gap-2.5 py-1.5">
                                        <Skeleton className="size-6 rounded-full" />
                                        <Skeleton className="h-3.5 w-32" />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            people.length > 0 && <CommandGroup heading={t('people')}>{people.map(row)}</CommandGroup>
                        )}
                        {coworkers.length > 0 && <CommandGroup heading={t('coworkers')}>{coworkers.map(row)}</CommandGroup>}
                    </CommandList>
                </Command>
            </DialogContent>
        </Dialog>
    )
}
