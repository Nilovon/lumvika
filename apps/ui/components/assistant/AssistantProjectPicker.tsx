'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import type { AssistantProjectOption } from '@/app/api/_actions/assistant.actions'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ChevronDownIcon, KanbanIcon } from '@/lib/icons'
import { cn } from '@/lib/utils'

type AssistantProjectPickerProps = {
    projects: AssistantProjectOption[]
    value: string | null
    onChange: (projectId: string | null) => void
    // Read-only, it is only the chip naming the project of the chat.
    disabled?: boolean
    className?: string
}

// The project a chat is about, as a chip: the assistant reads that project's instructions. A
// project the person no longer sees keeps its chip out of the way rather than naming it.
export function AssistantProjectPicker({ projects, value, onChange, disabled = false, className }: AssistantProjectPickerProps) {
    const t = useTranslations('assistant.project')
    const [open, setOpen] = useState(false)
    const current = projects.find(project => project.id === value) ?? null
    if (disabled && !current) return null

    const chip = (
        <button
            type="button"
            disabled={disabled}
            title={t('hint')}
            className={cn(
                'inline-flex h-7 max-w-full min-w-0 items-center gap-1.5 rounded-full border border-border px-2.5 text-xs font-medium transition-colors',
                current ? 'text-foreground' : 'text-muted-foreground',
                disabled ? 'cursor-default' : 'hover:bg-accent hover:text-accent-foreground',
                className
            )}
        >
            <KanbanIcon className="size-3.5 shrink-0" />
            <span className="truncate">{current ? current.name : t('pick')}</span>
            {!disabled && <ChevronDownIcon className="size-3 shrink-0" />}
        </button>
    )
    if (disabled) return chip

    const pick = (projectId: string | null) => {
        onChange(projectId)
        setOpen(false)
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild aria-label={t('label')}>
                {chip}
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 max-w-[calc(100vw-2rem)] p-0">
                <Command>
                    <CommandInput placeholder={t('search')} />
                    <CommandList className="max-h-[min(20rem,50vh)]">
                        <CommandEmpty>{t('empty')}</CommandEmpty>
                        <CommandGroup>
                            <CommandItem value={`__none ${t('none')}`} data-checked={!value} onSelect={() => pick(null)}>
                                <span className="text-muted-foreground">{t('none')}</span>
                            </CommandItem>
                            {projects.map(project => (
                                <CommandItem key={project.id} value={`${project.key} ${project.name}`} data-checked={project.id === value} onSelect={() => pick(project.id)}>
                                    <span className="w-12 shrink-0 font-mono text-xs text-muted-foreground">{project.key}</span>
                                    <span className="min-w-0 flex-1 truncate">{project.name}</span>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    )
}
