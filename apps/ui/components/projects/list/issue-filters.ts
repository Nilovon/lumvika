import { priorityWeight, statusIndex } from '@/components/issues/issue-status'
import type { IssuePriority, IssueStatus, IssueSummary } from '@lumvika/contracts'

export const ISSUE_SORTS = ['board', 'priority', 'updated', 'created', 'due'] as const
export type IssueSort = (typeof ISSUE_SORTS)[number]

export const UNASSIGNED_FILTER = 'unassigned'

export type IssueFilters = {
    statuses: IssueStatus[]
    priorities: IssuePriority[]
    // `user:<id>`, `agent:<id>` or `unassigned`.
    assignees: string[]
    text: string
}

export const NO_FILTERS: IssueFilters = { statuses: [], priorities: [], assignees: [], text: '' }

export function assigneeKey(issue: Pick<IssueSummary, 'assignee'>): string {
    if (!issue.assignee) return UNASSIGNED_FILTER
    return issue.assignee.kind === 'user' ? `user:${issue.assignee.userId}` : `agent:${issue.assignee.agentId}`
}

function matchesText(issue: IssueSummary, text: string): boolean {
    const needle = text.trim().toLowerCase()
    if (!needle) return true
    return issue.title.toLowerCase().includes(needle) || issue.ref.toLowerCase().includes(needle)
}

const COMPARE: Record<IssueSort, (a: IssueSummary, b: IssueSummary) => number> = {
    board: (a, b) => statusIndex(a.status) - statusIndex(b.status) || a.position - b.position,
    priority: (a, b) => priorityWeight(b.priority) - priorityWeight(a.priority) || b.updatedAt.localeCompare(a.updatedAt),
    updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
    created: (a, b) => b.createdAt.localeCompare(a.createdAt),
    // Issues without a date go last, whatever the order of the others.
    due: (a, b) => (a.dueDate ?? '9999-99-99').localeCompare(b.dueDate ?? '9999-99-99') || priorityWeight(b.priority) - priorityWeight(a.priority),
}

export function filterIssues(issues: readonly IssueSummary[], filters: IssueFilters, sort: IssueSort): IssueSummary[] {
    return issues
        .filter(issue => filters.statuses.length === 0 || filters.statuses.includes(issue.status))
        .filter(issue => filters.priorities.length === 0 || filters.priorities.includes(issue.priority))
        .filter(issue => filters.assignees.length === 0 || filters.assignees.includes(assigneeKey(issue)))
        .filter(issue => matchesText(issue, filters.text))
        .sort((a, b) => COMPARE[sort](a, b) || a.number - b.number)
}

export function hasFilters(filters: IssueFilters): boolean {
    return filters.statuses.length + filters.priorities.length + filters.assignees.length > 0 || filters.text.trim().length > 0
}
