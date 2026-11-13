'use client'

import { useWorkMembers } from '@/components/issues/useWorkMembers'
import { WorkMemberAvatar } from '@/components/issues/WorkMemberAvatar'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ChevronsUpDownIcon } from '@/lib/icons'
import { cn } from '@/lib/utils'
import type { WorkMemberRef } from '@lumvika/contracts'
import { useTranslations } from 'next-intl'
import { useRef, useState } from 'react'

const UNASSIGNED = '__unassigned'

export type AssigneePickerProps = {
    value: WorkMemberRef | null
    onChange: (next: WorkMemberRef | null) => void
    disabled?: boolean
    // `field` is a full-width control in a form, `compact` the avatar alone on a card or a row.
    variant?: 'field' | 'compact'
    // What "nobody" is called here: "Unassigned" for an issue, "No lead" for a project.
    emptyLabel?: string
    id?: string
    className?: string
}

function keyOf(member: WorkMemberRef | null): string {
    if (!member) return UNASSIGNED
    return member.kind === 'user' ? `user:${member.userId}` : `agent:${member.agentId}`
}

// Picks a person of the workspace or one of its coworkers, or nobody.
export function AssigneePicker({ value, onChange, disabled, variant = 'field', emptyLabel, id, className }: AssigneePickerProps) {
    const t = useTranslations('issues.assignee')
    const { people, coworkers, labelOf, meId } = useWorkMembers()
    const [open, setOpen] = useState(false)
    const triggerRef = useRef<HTMLButtonElement>(null)
    const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null)
    const nobody = emptyLabel ?? t('unassigned')
    const current = labelOf(value)
    const currentKey = keyOf(value)

    const onOpenChange = (next: boolean) => {
        if (next) setPortalContainer(triggerRef.current?.closest<HTMLElement>('[data-slot="dialog-content"]') ?? null)
        setOpen(next)
    }

    const pick = (next: WorkMemberRef | null) => {
        setOpen(false)
        if (keyOf(next) !== currentKey) onChange(next)
    }

    const sortedPeople = [...people].sort((a, b) => Number(b.id === meId) - Number(a.id === meId))

    return (
        <Popover open={open} onOpenChange={onOpenChange}>
            <PopoverTrigger asChild>
                <button
                    ref={triggerRef}
                    id={id}
                    type="button"
                    disabled={disabled}
                    aria-label={t('ariaLabel', { name: current?.name ?? nobody })}
                    onPointerDown={event => event.stopPropagation()}
                    className={cn(
                        'flex items-center transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                        variant === 'field'
                            ? 'min-h-8 w-full justify-between gap-2 rounded-md border border-input bg-transparent px-2.5 py-1 text-sm hover:bg-muted aria-expanded:bg-muted'
                            : 'size-7 shrink-0 justify-center rounded-full hover:bg-muted aria-expanded:bg-muted',
                        className,
                    )}
                >
                    {variant === 'field' ? (
                        <>
                            {value ? (
                                <WorkMemberAvatar member={value} size="sm" showName className="text-sm" />
                            ) : (
                                <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                                    <WorkMemberAvatar member={null} size="sm" />
                                    <span className="truncate">{nobody}</span>
                                </span>
                            )}
                            <ChevronsUpDownIcon className="size-3.5 shrink-0 opacity-50" />
                        </>
                    ) : (
                        <WorkMemberAvatar member={value} size="sm" />
                    )}
                </button>
            </PopoverTrigger>
            <PopoverContent container={portalContainer} align={variant === 'field' ? 'start' : 'end'} className="w-[min(18rem,calc(100vw-2rem))] p-0" onClick={event => event.stopPropagation()}>
                <Command>
                    <CommandInput placeholder={t('search')} className="h-8 text-sm" />
                    <CommandList className="mt-1 max-h-72 border-t border-border/50">
                        <CommandEmpty>{t('empty')}</CommandEmpty>
                        <CommandGroup>
                            <CommandItem value={UNASSIGNED} keywords={[nobody]} onSelect={() => pick(null)} data-checked={currentKey === UNASSIGNED ? 'true' : undefined} className="gap-2.5 py-1.5">
                                <WorkMemberAvatar member={null} size="sm" />
                                <span className="flex-1 truncate">{nobody}</span>
                            </CommandItem>
                        </CommandGroup>
                        {sortedPeople.length > 0 && (
                            <CommandGroup heading={t('people')}>
                                {sortedPeople.map(person => {
                                    const ref: WorkMemberRef = { kind: 'user', userId: person.id }
                                    const name = labelOf(ref)?.name ?? ''
                                    return (
                                        <CommandItem key={person.id} value={keyOf(ref)} keywords={[name]} onSelect={() => pick(ref)} data-checked={currentKey === keyOf(ref) ? 'true' : undefined} className="gap-2.5 py-1.5">
                                            <WorkMemberAvatar member={ref} size="sm" />
                                            <span className="flex-1 truncate">{person.id === meId ? t('you', { name }) : name}</span>
                                        </CommandItem>
                                    )
                                })}
                            </CommandGroup>
                        )}
                        {coworkers.length > 0 && (
                            <CommandGroup heading={t('coworkers')}>
                                {coworkers.map(agent => {
                                    const ref: WorkMemberRef = { kind: 'agent', agentId: agent.id }
                                    return (
                                        <CommandItem key={agent.id} value={keyOf(ref)} keywords={[agent.name]} onSelect={() => pick(ref)} data-checked={currentKey === keyOf(ref) ? 'true' : undefined} className="gap-2.5 py-1.5">
                                            <WorkMemberAvatar member={ref} size="sm" />
                                            <span className="flex-1 truncate">{agent.name}</span>
                                        </CommandItem>
                                    )
                                })}
                            </CommandGroup>
                        )}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    )
}
