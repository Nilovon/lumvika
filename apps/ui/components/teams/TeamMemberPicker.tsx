'use client'

import { AddButton } from '@/components/connections/AiProvidersPanel'
import { MemberAvatar } from '@/components/teams/MemberAvatar'
import type { WorkMemberIdentity } from '@/components/teams/useWorkMembers'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { WorkMemberRef } from '@lumvika/contracts'
import { useTranslations } from 'next-intl'
import { useRef, useState } from 'react'

type TeamMemberPickerProps = {
    people: WorkMemberIdentity[]
    coworkers: WorkMemberIdentity[]
    // Members already on the team, by `memberKey`.
    taken: ReadonlySet<string>
    disabled?: boolean
    onPick: (member: WorkMemberRef, name: string) => void
}

export function TeamMemberPicker({ people, coworkers, taken, disabled, onPick }: TeamMemberPickerProps) {
    const t = useTranslations('teams.picker')
    const tMember = useTranslations('teams.member')
    const [open, setOpen] = useState(false)
    const triggerRef = useRef<HTMLButtonElement>(null)
    const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null)
    const freePeople = people.filter(person => !taken.has(person.key))
    const freeCoworkers = coworkers.filter(coworker => !taken.has(coworker.key))

    const onOpenChange = (next: boolean) => {
        // Inside a dialog the popover is portalled into it, or its first click counts as outside.
        if (next) setPortalContainer(triggerRef.current?.closest<HTMLElement>('[data-slot="dialog-content"]') ?? null)
        setOpen(next)
    }

    const pick = (member: WorkMemberIdentity) => {
        setOpen(false)
        onPick(member.ref, member.name)
    }

    const row = (member: WorkMemberIdentity) => (
        <CommandItem key={member.key} value={`${member.name} ${member.key}`} onSelect={() => pick(member)} className="gap-2">
            <MemberAvatar member={member} />
            <span className="truncate">{member.isMe ? tMember('you', { name: member.name }) : member.name}</span>
        </CommandItem>
    )

    return (
        <Popover open={open} onOpenChange={onOpenChange}>
            <PopoverTrigger asChild>
                <AddButton ref={triggerRef} label={t('add')} disabled={disabled} />
            </PopoverTrigger>
            <PopoverContent container={portalContainer} align="end" className="w-[min(18rem,calc(100vw-2rem))] p-0">
                <Command>
                    <CommandInput placeholder={t('search')} />
                    <CommandList className="max-h-72">
                        <CommandEmpty>{freePeople.length + freeCoworkers.length === 0 ? t('empty') : t('noMatch')}</CommandEmpty>
                        {freePeople.length > 0 && <CommandGroup heading={t('people')}>{freePeople.map(row)}</CommandGroup>}
                        {freeCoworkers.length > 0 && <CommandGroup heading={t('coworkers')}>{freeCoworkers.map(row)}</CommandGroup>}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    )
}
