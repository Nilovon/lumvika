'use client'

import { Progress } from '@/components/ui/progress'
import { progressPercent, type GoalProgress as Progression } from '@/lib/work/goal-tree'
import { useTranslations } from 'next-intl'

export function GoalProgress({ progress }: { progress: Progression }) {
    const t = useTranslations('goals.row')
    const percent = progressPercent(progress)
    const label = percent === null ? t('noIssues') : t('progress', { done: progress.done, total: progress.open + progress.done })
    return (
        <div className="flex min-w-0 items-center gap-2">
            <Progress value={percent ?? 0} size="sm" label={label} className="min-w-16 flex-1" />
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{label}</span>
        </div>
    )
}
