'use client'

import { IssueStatusBadge } from '@/components/issues/IssueStatusBadge'
import { nextStatuses } from '@/components/issues/issue-status'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ChevronDownIcon } from '@/lib/icons'
import { cn } from '@/lib/utils'
import type { IssueStatus } from '@lumvika/contracts'
import { useTranslations } from 'next-intl'

export type IssueStatusPickerProps = {
    status: IssueStatus
    onChange: (next: IssueStatus) => void
    disabled?: boolean
    // `field` is a full-width control in a form, `badge` the status pill alone on a card or a row.
    variant?: 'field' | 'badge'
    id?: string
    className?: string
}

// Offers only the statuses the workflow allows from the current one: a refused move is never a choice.
export function IssueStatusPicker({ status, onChange, disabled, variant = 'badge', id, className }: IssueStatusPickerProps) {
    const t = useTranslations('issues.statusPicker')
    const tStatus = useTranslations('issues.status')
    const targets = nextStatuses(status)

    return (
        <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild disabled={disabled}>
                <button
                    id={id}
                    type="button"
                    aria-label={t('ariaLabel', { status: tStatus(status) })}
                    onPointerDown={event => event.stopPropagation()}
                    onClick={event => event.stopPropagation()}
                    className={cn(
                        'inline-flex items-center gap-1 rounded-md transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60',
                        variant === 'field' ? 'min-h-8 w-full justify-between border border-input px-2.5 py-1 hover:bg-muted aria-expanded:bg-muted' : '-m-0.5 p-0.5 hover:bg-muted aria-expanded:bg-muted',
                        className,
                    )}
                >
                    <IssueStatusBadge status={status} />
                    <ChevronDownIcon className={cn('shrink-0 opacity-50', variant === 'field' ? 'size-3.5' : 'size-3')} />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-auto min-w-44" onClick={event => event.stopPropagation()}>
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{t('moveTo')}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {targets.map(target => (
                    <DropdownMenuItem key={target} onSelect={() => onChange(target)}>
                        <IssueStatusBadge status={target} />
                    </DropdownMenuItem>
                ))}
                {targets.length === 0 && <DropdownMenuItem disabled>{t('noMove', { status: tStatus(status) })}</DropdownMenuItem>}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
