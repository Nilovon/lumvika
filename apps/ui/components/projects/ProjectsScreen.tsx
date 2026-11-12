'use client'

import { listProjectsAction } from '@/app/api/_actions/projects.actions'
import { PageFrame } from '@/components/layout/PageFrame'
import { NAV_ICONS } from '@/components/layout/sidebar/nav-icons'
import { NewProjectDialog } from '@/components/projects/NewProjectDialog'
import { PROJECT_GRID, ProjectListRow } from '@/components/projects/ProjectListRow'
import { ProjectsSkeleton } from '@/components/projects/ProjectsSkeleton'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { FilterSelect, type FilterOption } from '@/components/ui/filter-select'
import { useErrorText } from '@/hooks/useErrorText'
import { FilterIcon, PlusIcon } from '@/lib/icons'
import { cn } from '@/lib/utils'
import { PROJECT_STATUSES, type ProjectStatus, type ProjectSummary } from '@lumvika/contracts'
import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useState } from 'react'

export function ProjectsScreen() {
    const t = useTranslations('projects')
    const tStatus = useTranslations('projects.status')
    const errorText = useErrorText()
    const [projects, setProjects] = useState<ProjectSummary[] | null>(null)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [statuses, setStatuses] = useState<ProjectStatus[]>([])
    const [creating, setCreating] = useState(false)
    const includeArchived = statuses.includes('archived')

    useEffect(() => {
        let active = true
        void listProjectsAction({ includeArchived }).then(result => {
            if (!active) return
            if (result.ok) {
                setProjects(result.projects)
                setLoadError(null)
            } else {
                setProjects(current => current ?? [])
                setLoadError(errorText(result))
            }
        })
        return () => {
            active = false
        }
    }, [includeArchived, errorText])

    const statusOptions = useMemo<FilterOption<ProjectStatus>[]>(() => PROJECT_STATUSES.map(status => ({ value: status, label: tStatus(status) })), [tStatus])
    const shown = useMemo(() => (projects ?? []).filter(project => (statuses.length ? statuses.includes(project.status) : project.status !== 'archived')), [projects, statuses])
    const hasProjects = (projects?.length ?? 0) > 0 || statuses.length > 0

    const newProjectButton = (
        <Button size="sm" onClick={() => setCreating(true)}>
            <PlusIcon />
            {t('list.new')}
        </Button>
    )

    return (
        <PageFrame title={t('title')} description={t('description')} actions={hasProjects ? newProjectButton : undefined} width="full" bodyClassName="max-w-6xl">
            {projects === null ? (
                <ProjectsSkeleton />
            ) : !hasProjects ? (
                <EmptyState icon={NAV_ICONS.projects} title={loadError ? t('list.loadFailed') : t('empty.title')} description={loadError ?? t('empty.description')} action={loadError ? undefined : newProjectButton} className="py-16" />
            ) : (
                <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <FilterSelect label={t('list.statusFilter')} options={statusOptions} values={statuses} onChange={setStatuses} />
                        <span className="text-xs text-muted-foreground">{t('list.count', { count: shown.length })}</span>
                    </div>
                    {shown.length === 0 ? (
                        <EmptyState
                            icon={FilterIcon}
                            title={t('list.noMatch')}
                            description={t('list.noMatchHint')}
                            action={
                                <Button size="sm" variant="outline" onClick={() => setStatuses([])}>
                                    {t('list.clearFilter')}
                                </Button>
                            }
                            className="rounded-lg border border-dashed border-border py-12"
                        />
                    ) : (
                        <div className="overflow-hidden rounded-lg border border-border">
                            <div className={cn('hidden border-b border-border bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground', PROJECT_GRID)}>
                                <span className="pl-16.5">{t('list.columns.name')}</span>
                                <span>{t('list.columns.status')}</span>
                                <span>{t('list.columns.lead')}</span>
                                <span>{t('list.columns.progress')}</span>
                                <span className="text-right">{t('list.columns.target')}</span>
                            </div>
                            {shown.map(project => (
                                <ProjectListRow key={project.id} project={project} />
                            ))}
                        </div>
                    )}
                </div>
            )}
            <NewProjectDialog open={creating} onOpenChange={setCreating} takenKeys={(projects ?? []).map(project => project.key)} />
        </PageFrame>
    )
}
