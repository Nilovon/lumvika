'use client'

import { WorkMemberAvatar } from '@/components/issues/WorkMemberAvatar'
import { dayOf } from '@/components/issues/issue-dates'
import { ProjectStatusBadge } from '@/components/projects/ProjectStatusBadge'
import { projectProgress } from '@/components/projects/project-progress'
import { Progress } from '@/components/ui/progress'
import { LockIcon } from '@/lib/icons'
import type { ProjectSummary } from '@lumvika/contracts'
import { shortDate } from '@lumvika/i18n/format'
import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'

// The columns of the project list on a wide screen, shared with its header and its skeleton.
export const PROJECT_GRID = 'md:grid md:grid-cols-[minmax(0,1fr)_6.5rem_10rem_11rem_6.5rem] md:items-center md:gap-4'

export function ProjectListRow({ project }: { project: ProjectSummary }) {
    const t = useTranslations('projects.list')
    const locale = useLocale()
    const progress = projectProgress(project.issueCounts)

    return (
        <Link href={`/projects/${project.key}`} className={`flex flex-col gap-2.5 border-b border-border px-3 py-3 transition-colors outline-none last:border-b-0 hover:bg-muted/50 focus-visible:bg-muted/60 ${PROJECT_GRID}`}>
            <span className="flex min-w-0 items-center gap-2.5">
                <span className="w-14 shrink-0 font-mono text-[11px] text-muted-foreground">{project.key}</span>
                <span className="flex min-w-0 flex-col">
                    <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-sm font-medium">{project.name}</span>
                        {project.visibility === 'restricted' && <LockIcon aria-label={t('restricted')} className="size-3 shrink-0 text-muted-foreground" />}
                    </span>
                    {project.description && <span className="truncate text-xs text-muted-foreground">{project.description}</span>}
                </span>
            </span>
            <span className="flex flex-wrap items-center gap-x-3 gap-y-2 pl-16.5 md:contents">
                <span className="md:flex">
                    <ProjectStatusBadge status={project.status} />
                </span>
                <span className="min-w-0 text-xs md:flex">
                    {project.lead ? <WorkMemberAvatar member={project.lead} size="xs" showName /> : <span className="text-muted-foreground max-md:hidden">{t('noLead')}</span>}
                </span>
                <span className="flex min-w-32 flex-1 items-center gap-2 md:flex-none">
                    <Progress value={progress.percent} size="sm" label={t('progress', { done: progress.done, total: progress.total })} className="w-16 shrink-0 md:w-20" />
                    <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">{progress.total === 0 ? t('noIssues') : t('progress', { done: progress.done, total: progress.total })}</span>
                </span>
                <span className="text-xs text-muted-foreground tabular-nums md:text-right">{project.targetDate ? shortDate(dayOf(project.targetDate), locale) : <span className="max-md:hidden">{t('noTarget')}</span>}</span>
            </span>
        </Link>
    )
}
