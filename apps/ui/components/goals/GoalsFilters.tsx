'use client'

import type { GoalTeamOption } from '@/app/api/_actions/goals.actions'
import { TeamColorDot } from '@/components/teams/TeamColorDot'
import { FilterSelect, type FilterOption } from '@/components/ui/filter-select'
import { GOAL_STATUSES, type GoalStatus } from '@lumvika/contracts'
import { useTranslations } from 'next-intl'

type GoalsFiltersProps = {
    teams: GoalTeamOption[]
    statuses: GoalStatus[]
    onStatusesChange: (statuses: GoalStatus[]) => void
    teamIds: string[]
    onTeamIdsChange: (teamIds: string[]) => void
}

export function GoalsFilters({ teams, statuses, onStatusesChange, teamIds, onTeamIdsChange }: GoalsFiltersProps) {
    const t = useTranslations('goals')
    const statusOptions: FilterOption<GoalStatus>[] = GOAL_STATUSES.map(status => ({ value: status, label: t(`status.${status}`) }))
    const teamOptions: FilterOption[] = teams.map(team => ({ value: team.id, label: team.name, icon: <TeamColorDot color={team.color} /> }))

    return (
        <div className="flex flex-wrap items-center gap-2">
            <FilterSelect label={t('filters.status')} options={statusOptions} values={statuses} onChange={onStatusesChange} />
            <FilterSelect label={t('filters.team')} options={teamOptions} values={teamIds} onChange={onTeamIdsChange} />
        </div>
    )
}
