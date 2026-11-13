'use client'

import { IssueStatusBadge } from '@/components/issues/IssueStatusBadge'
import { BOARD_STATUSES } from '@/components/issues/issue-status'
import { OverviewSection } from '@/components/projects/overview/OverviewSection'
import { projectProgress } from '@/components/projects/project-progress'
import { Progress } from '@/components/ui/progress'
import type { ProjectDetail } from '@lumvika/contracts'
import { useTranslations } from 'next-intl'

export function ProjectProgressSection({ project }: { project: ProjectDetail }) {
    const t = useTranslations('projects.overview')
    const progress = projectProgress(project.issueCounts)
    const counted = BOARD_STATUSES.filter(status => (project.issueCounts[status] ?? 0) > 0)

    return (
        <OverviewSection title={t('progressTitle')}>
            <div className="flex items-center gap-3">
                <Progress value={progress.percent} size="md" label={t('progressLabel', { percent: progress.percent })} className="flex-1" />
                <span className="text-sm font-medium tabular-nums">{t('percent', { percent: progress.percent })}</span>
            </div>
            <p className="text-xs text-muted-foreground">{progress.total === 0 ? t('noIssuesYet') : t('progressSummary', { done: progress.done, open: progress.open })}</p>
            {counted.length > 0 && (
                <ul className="flex flex-wrap gap-x-3 gap-y-2">
                    {counted.map(status => (
                        <li key={status} className="flex items-center gap-1.5 text-xs tabular-nums">
                            <IssueStatusBadge status={status} />
                            {project.issueCounts[status]}
                        </li>
                    ))}
                </ul>
            )}
        </OverviewSection>
    )
}
