'use client'

import type { GoalStatus } from '@lumvika/contracts'
import { Badge, type BadgeTone } from '@lumvika/ui/primitives'
import { useTranslations } from 'next-intl'

export const GOAL_STATUS_TONES: Record<GoalStatus, BadgeTone> = {
    planned: 'neutral',
    active: 'cyan',
    achieved: 'green',
    cancelled: 'red',
}

export function GoalStatusBadge({ status }: { status: GoalStatus }) {
    const t = useTranslations('goals.status')
    return (
        <Badge size="xs" tone={GOAL_STATUS_TONES[status] ?? 'neutral'} glow={false} className="shrink-0 font-medium">
            {t(status)}
        </Badge>
    )
}
