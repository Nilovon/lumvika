'use client'

import { ORG_STATUS_TONES, type OrgCoworker } from '@/components/teams/org/org-coworker'
import { cn } from '@/lib/utils'
import { Badge } from '@lumvika/ui/primitives'
import { AgentBuddy, buddyMoodOfStatus } from '@lumvika/ui/iso-grid'
import { useTranslations } from 'next-intl'

// Who a coworker is in the chart: its buddy, name, title, Box and live status.
export function OrgCoworkerSummary({ coworker, compact = false }: { coworker: OrgCoworker; compact?: boolean }) {
    const t = useTranslations('teams.org')
    const mood = coworker.status === 'disabled' ? buddyMoodOfStatus('idle', true) : buddyMoodOfStatus(coworker.status ?? 'idle')
    return (
        <div className="flex min-w-0 items-center gap-2.5">
            <AgentBuddy agentId={coworker.id} mood={mood} size={compact ? 28 : 36} animated={false} facing="right" className="shrink-0" />
            <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">{coworker.name}</span>
                <span className={cn('truncate text-xs', coworker.title ? 'text-foreground/80' : 'text-muted-foreground italic')}>{coworker.title ?? t('noTitle')}</span>
                {!compact && <span className="truncate text-xs text-muted-foreground">{coworker.spaceName || t('unnamedBox')}</span>}
            </div>
            {coworker.status && compact && (
                <Badge size="xs" tone={ORG_STATUS_TONES[coworker.status]} glow={false} className="hidden shrink-0 font-medium @xs:inline-flex">
                    {t(`status.${coworker.status}`)}
                </Badge>
            )}
        </div>
    )
}

export function OrgCoworkerFooter({ coworker }: { coworker: OrgCoworker }) {
    const t = useTranslations('teams.org')
    return (
        <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-2 text-xs text-muted-foreground">
            {coworker.status ? (
                <Badge size="xs" tone={ORG_STATUS_TONES[coworker.status]} glow={false} className="font-medium">
                    {t(`status.${coworker.status}`)}
                </Badge>
            ) : (
                <span />
            )}
            <span className="truncate">{t('reports', { count: coworker.reportCount })}</span>
        </div>
    )
}
