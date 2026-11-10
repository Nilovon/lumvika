'use client'

import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import type { StewardNudge as Nudge } from '@/lib/steward/dock-feed'
import type { StewardCorner } from '@/lib/steward-layout'

import { StewardDockBubble } from './StewardDockBubble'

type StewardNudgeProps = { corner: StewardCorner; nudge: Nudge; onOpen: () => void; onLater: () => void }

/**
 * The Steward stopped on a question or an approval while its column was closed. The card only says
 * so: the answer is given in the column, where the question's own form is.
 */
export function StewardNudge({ corner, nudge, onOpen, onLater }: StewardNudgeProps) {
    const t = useTranslations('steward.nudge')
    const approval = nudge.kind === 'approval'
    return (
        <StewardDockBubble corner={corner} tone="orange">
            <div className="flex flex-col gap-1 p-3">
                <span className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
                    {approval ? t('approval') : t('question')}
                    {nudge.more > 0 && <span className="shrink-0 tabular-nums">{t('more', { count: nudge.more })}</span>}
                </span>
                <p className="line-clamp-3 text-sm font-medium text-foreground">{nudge.title}</p>
                {nudge.detail && <p className="line-clamp-2 text-xs text-muted-foreground">{nudge.detail}</p>}
                <div className="mt-2 flex gap-1.5">
                    <Button size="sm" onClick={onOpen}>
                        {approval ? t('review') : t('answer')}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={onLater}>
                        {t('later')}
                    </Button>
                </div>
            </div>
        </StewardDockBubble>
    )
}
