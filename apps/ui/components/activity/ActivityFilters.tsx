'use client'

import { Button } from '@/components/ui/button'
import { FilterSelect, type FilterOption } from '@/components/ui/filter-select'
import type { ActivityEntityType, ProjectSummary } from '@lumvika/contracts'
import { useTranslations } from 'next-intl'

export type ActorKind = 'user' | 'agent'

export type ActivityFilterState = { projectIds: string[]; actorKinds: ActorKind[]; entityTypes: ActivityEntityType[] }

export const NO_ACTIVITY_FILTERS: ActivityFilterState = { projectIds: [], actorKinds: [], entityTypes: [] }

const ENTITY_TYPES = ['issue', 'issue_comment', 'project', 'goal', 'team', 'channel', 'agent'] as const satisfies readonly ActivityEntityType[]

export function hasActivityFilters(filters: ActivityFilterState): boolean {
    return filters.projectIds.length + filters.actorKinds.length + filters.entityTypes.length > 0
}

export function ActivityFilters({ filters, onChange, projects }: { filters: ActivityFilterState; onChange: (filters: ActivityFilterState) => void; projects: ProjectSummary[] }) {
    const t = useTranslations('activity.filters')
    const projectOptions: FilterOption[] = projects.map(project => ({ value: project.id, label: project.name }))
    const actorOptions: FilterOption<ActorKind>[] = [
        { value: 'user', label: t('people') },
        { value: 'agent', label: t('coworkers') },
    ]
    const entityOptions: FilterOption<ActivityEntityType>[] = ENTITY_TYPES.map(type => ({ value: type, label: t(`entities.${type}`) }))

    return (
        <div className="flex flex-wrap items-center gap-2">
            <FilterSelect label={t('project')} options={projectOptions} values={filters.projectIds} onChange={projectIds => onChange({ ...filters, projectIds })} />
            <FilterSelect label={t('actor')} options={actorOptions} values={filters.actorKinds} onChange={actorKinds => onChange({ ...filters, actorKinds })} />
            <FilterSelect label={t('entity')} options={entityOptions} values={filters.entityTypes} onChange={entityTypes => onChange({ ...filters, entityTypes })} />
            {hasActivityFilters(filters) && (
                <Button type="button" size="sm" variant="ghost" onClick={() => onChange(NO_ACTIVITY_FILTERS)} className="text-muted-foreground">
                    {t('clear')}
                </Button>
            )}
        </div>
    )
}
