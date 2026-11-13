'use client'

import type { OverviewProject } from '@/app/api/_services/work/overview.service'
import { OverviewCard } from '@/components/overview/OverviewCard'
import { Progress } from '@/components/ui/progress'
import { useTranslations } from 'next-intl'
import Link from 'next/link'

const SHOWN = 6

// The active projects, the ones that need a look first: done over total, and what waits in them.
export function ActiveProjects({ projects }: { projects: OverviewProject[] }) {
    const t = useTranslations('overview.projects')

    return (
        <OverviewCard title={t('title')} link={{ href: '/projects', label: t('all') }}>
            {projects.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t('empty')}</p>
            ) : (
                <ul className="-mx-2 flex flex-col">
                    {projects.slice(0, SHOWN).map(project => {
                        const percent = project.total === 0 ? 0 : Math.round((project.done / project.total) * 100)
                        const progressLabel = project.total === 0 ? t('noIssues') : t('progress', { done: project.done, total: project.total })
                        return (
                            <li key={project.id}>
                                <Link href={`/projects/${project.key}`} className="flex min-w-0 flex-col gap-2 rounded-lg px-2 py-2 transition-colors outline-none hover:bg-muted/50 focus-visible:bg-muted/60 @lg:flex-row @lg:items-center @lg:gap-4">
                                    <span className="flex min-w-0 flex-1 items-center gap-2">
                                        <span className="w-12 shrink-0 font-mono text-[11px] text-muted-foreground">{project.key}</span>
                                        <span className="truncate text-sm font-medium">{project.name}</span>
                                    </span>
                                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground @xs:pl-14 @lg:pl-0">
                                        {project.inReview > 0 && <span className="whitespace-nowrap">{t('inReview', { count: project.inReview })}</span>}
                                        {project.blocked > 0 && <span className="whitespace-nowrap text-destructive">{t('blocked', { count: project.blocked })}</span>}
                                        <span className="flex items-center gap-2">
                                            <Progress value={percent} size="sm" label={progressLabel} className="w-16 shrink-0" />
                                            <span className="whitespace-nowrap tabular-nums">{progressLabel}</span>
                                        </span>
                                    </span>
                                </Link>
                            </li>
                        )
                    })}
                </ul>
            )}
        </OverviewCard>
    )
}
