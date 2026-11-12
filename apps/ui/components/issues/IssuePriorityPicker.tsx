'use client'

import { IssuePriorityIndicator } from '@/components/issues/IssuePriorityIndicator'
import { PRIORITIES_BY_WEIGHT } from '@/components/issues/issue-status'
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ChevronsUpDownIcon } from '@/lib/icons'
import { cn } from '@/lib/utils'
import type { IssuePriority } from '@lumvika/contracts'
import { useTranslations } from 'next-intl'

export function IssuePriorityPicker({ priority, onChange, disabled, id, className }: { priority: IssuePriority; onChange: (next: IssuePriority) => void; disabled?: boolean; id?: string; className?: string }) {
    const t = useTranslations('issues.priority')

    return (
        <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild disabled={disabled}>
                <button
                    id={id}
                    type="button"
                    aria-label={t('ariaLabel', { priority: t(priority) })}
                    className={cn('flex min-h-8 w-full items-center justify-between gap-2 rounded-md border border-input px-2.5 py-1 text-sm transition-colors hover:bg-muted aria-expanded:bg-muted disabled:cursor-not-allowed disabled:opacity-60', className)}
                >
                    <IssuePriorityIndicator priority={priority} showLabel />
                    <ChevronsUpDownIcon className="size-3.5 shrink-0 opacity-50" />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-auto min-w-44">
                <DropdownMenuRadioGroup value={priority} onValueChange={value => onChange(value as IssuePriority)}>
                    {PRIORITIES_BY_WEIGHT.map(option => (
                        <DropdownMenuRadioItem key={option} value={option}>
                            <IssuePriorityIndicator priority={option} showLabel />
                        </DropdownMenuRadioItem>
                    ))}
                </DropdownMenuRadioGroup>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
