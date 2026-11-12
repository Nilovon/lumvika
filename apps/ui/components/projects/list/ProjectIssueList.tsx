'use client'

import { IssuePriorityIndicator } from '@/components/issues/IssuePriorityIndicator'
import { IssueRow } from '@/components/issues/IssueRow'
import { IssueStatusPicker } from '@/components/issues/IssueStatusPicker'
import { PRIORITIES_BY_WEIGHT, BOARD_STATUSES } from '@/components/issues/issue-status'
import { useWorkMembers } from '@/components/issues/useWorkMembers'
import { WorkMemberAvatar } from '@/components/issues/WorkMemberAvatar'
import { assigneeKey, filterIssues, hasFilters, ISSUE_SORTS, NO_FILTERS, UNASSIGNED_FILTER, type IssueFilters, type IssueSort } from '@/components/projects/list/issue-filters'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { FilterSelect, type FilterOption } from '@/components/ui/filter-select'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FilterIcon, ListIcon, SearchIcon } from '@/lib/icons'
import type { IssuePriority, IssueStatus, IssueSummary, WorkMemberRef } from '@lumvika/contracts'
import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'

type ProjectIssueListProps = {
    issues: IssueSummary[]
    onOpenIssue: (issue: IssueSummary) => void
    onStatusChange: (issue: IssueSummary, status: IssueStatus) => void
    onCreate?: () => void
}

function refOf(key: string): WorkMemberRef | null {
    if (key.startsWith('user:')) return { kind: 'user', userId: key.slice(5) }
    if (key.startsWith('agent:')) return { kind: 'agent', agentId: key.slice(6) }
    return null
}

export function ProjectIssueList({ issues, onOpenIssue, onStatusChange, onCreate }: ProjectIssueListProps) {
    const t = useTranslations('projects.issueList')
    const tStatus = useTranslations('issues.status')
    const tPriority = useTranslations('issues.priority')
    const tMember = useTranslations('issues.member')
    const { labelOf } = useWorkMembers()
    const [filters, setFilters] = useState<IssueFilters>(NO_FILTERS)
    const [sort, setSort] = useState<IssueSort>('board')
    const set = <K extends keyof IssueFilters>(key: K, value: IssueFilters[K]) => setFilters(current => ({ ...current, [key]: value }))

    const shown = useMemo(() => filterIssues(issues, filters, sort), [issues, filters, sort])

    const statusOptions = useMemo<FilterOption<IssueStatus>[]>(() => BOARD_STATUSES.map(status => ({ value: status, label: tStatus(status) })), [tStatus])
    const priorityOptions = useMemo<FilterOption<IssuePriority>[]>(() => PRIORITIES_BY_WEIGHT.map(priority => ({ value: priority, label: tPriority(priority), icon: <IssuePriorityIndicator priority={priority} /> })), [tPriority])
    // Only who holds an issue of this project is offered, nobody first.
    const assigneeOptions = useMemo<FilterOption[]>(() => {
        const keys = [...new Set(issues.map(assigneeKey))].sort((a, b) => Number(b === UNASSIGNED_FILTER) - Number(a === UNASSIGNED_FILTER))
        return keys.map(key => {
            const member = refOf(key)
            return { value: key, label: member ? (labelOf(member)?.name ?? key) : tMember('unassigned'), icon: <WorkMemberAvatar member={member} size="xs" /> }
        })
    }, [issues, labelOf, tMember])

    if (issues.length === 0) {
        return (
            <EmptyState
                icon={ListIcon}
                title={t('emptyIssues')}
                description={t('emptyIssuesHint')}
                action={
                    onCreate && (
                        <Button size="sm" onClick={onCreate}>
                            {t('newIssue')}
                        </Button>
                    )
                }
                className="rounded-lg border border-dashed border-border py-14"
            />
        )
    }

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-full sm:w-56">
                    <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={filters.text} onChange={event => set('text', event.target.value)} placeholder={t('search')} aria-label={t('search')} className="h-9 pl-8" />
                </div>
                <FilterSelect label={t('filters.status')} options={statusOptions} values={filters.statuses} onChange={values => set('statuses', values)} />
                <FilterSelect label={t('filters.priority')} options={priorityOptions} values={filters.priorities} onChange={values => set('priorities', values)} />
                <FilterSelect label={t('filters.assignee')} options={assigneeOptions} values={filters.assignees} onChange={values => set('assignees', values)} />
                <Select value={sort} onValueChange={value => setSort(value as IssueSort)}>
                    <SelectTrigger className="h-9 w-auto gap-2 sm:ml-auto" aria-label={t('sortLabel')}>
                        <span className="text-muted-foreground">{t('sortLabel')}</span>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper" align="end">
                        {ISSUE_SORTS.map(option => (
                            <SelectItem key={option} value={option}>
                                {t(`sort.${option}`)}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {shown.length === 0 ? (
                <EmptyState
                    icon={FilterIcon}
                    title={t('noIssueMatch')}
                    description={t('noIssueMatchHint')}
                    action={
                        hasFilters(filters) && (
                            <Button size="sm" variant="outline" onClick={() => setFilters(NO_FILTERS)}>
                                {t('clearFilters')}
                            </Button>
                        )
                    }
                    className="rounded-lg border border-dashed border-border py-12"
                />
            ) : (
                <div className="overflow-hidden rounded-lg border border-border">
                    {shown.map(issue => (
                        <IssueRow key={issue.id} issue={issue} onOpen={onOpenIssue} status={<IssueStatusPicker status={issue.status} onChange={status => onStatusChange(issue, status)} />} />
                    ))}
                </div>
            )}
            <p className="text-xs text-muted-foreground">{t('shown', { shown: shown.length, total: issues.length })}</p>
        </div>
    )
}
