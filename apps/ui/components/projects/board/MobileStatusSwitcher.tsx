'use client'

import { ISSUE_STATUS_TONES } from '@/components/issues/issue-status'
import type { BoardColumns } from '@/components/projects/board/board-logic'
import { cn } from '@/lib/utils'
import type { IssueStatus } from '@lumvika/contracts'
import { Badge } from '@lumvika/ui/primitives'
import { useTranslations } from 'next-intl'

// The columns of the board as a row of tabs on a phone, one column shown at a time.
export function MobileStatusSwitcher({ statuses, columns, value, onChange }: { statuses: IssueStatus[]; columns: BoardColumns; value: IssueStatus; onChange: (status: IssueStatus) => void }) {
    const t = useTranslations('projects.board')
    const tStatus = useTranslations('issues.status')

    return (
        <div role="tablist" aria-label={t('switcherLabel')} className="-mx-4 flex w-[calc(100%+2rem)] gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {statuses.map(status => {
                const active = status === value
                return (
                    <button
                        key={status}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => onChange(status)}
                        className={cn('flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors', active ? 'border-foreground/25 bg-foreground/5 text-foreground' : 'border-border text-muted-foreground')}
                    >
                        <Badge size="xs" tone={ISSUE_STATUS_TONES[status]} glow={false} className="font-medium">
                            {tStatus(status)}
                        </Badge>
                        <span className="tabular-nums">{columns[status].length}</span>
                    </button>
                )
            })}
        </div>
    )
}
