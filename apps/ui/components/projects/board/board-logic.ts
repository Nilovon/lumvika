import { canTransitionIssue, type IssueStatus, type IssueSummary } from '@lumvika/contracts'

import { BOARD_STATUSES } from '@/components/issues/issue-status'

// The room the server leaves between two cards (ISSUE_POSITION_STEP of issues.service).
export const POSITION_STEP = 1024

export type BoardColumns = Record<IssueStatus, IssueSummary[]>

// Reordering inside a column is always allowed; leaving it follows the workflow.
export function canDropOn(from: IssueStatus, to: IssueStatus): boolean {
    return from === to || canTransitionIssue(from, to)
}

export function byPosition(a: IssueSummary, b: IssueSummary): number {
    return a.position - b.position || a.number - b.number
}

export function groupByStatus(issues: readonly IssueSummary[]): BoardColumns {
    const columns = Object.fromEntries(BOARD_STATUSES.map(status => [status, [] as IssueSummary[]])) as BoardColumns
    for (const issue of issues) columns[issue.status].push(issue)
    for (const status of BOARD_STATUSES) columns[status].sort(byPosition)
    return columns
}

// A position strictly between two neighbours, either of which may be missing (an empty column, the
// top or the end of one).
export function positionBetween(before: number | undefined, after: number | undefined): number {
    if (before === undefined && after === undefined) return POSITION_STEP
    if (before === undefined) return (after as number) - POSITION_STEP
    if (after === undefined) return before + POSITION_STEP
    return (before + after) / 2
}

// Where a card dropped in `column` lands: just above `beforeIssueId`, or at the end when that is
// null. The dragged card is left out of the column first, so a card dropped on itself stays put.
export function dropPosition(column: readonly IssueSummary[], draggedId: string, beforeIssueId: string | null): number {
    const others = column.filter(issue => issue.id !== draggedId)
    if (beforeIssueId === null) return positionBetween(others.at(-1)?.position, undefined)
    const index = others.findIndex(issue => issue.id === beforeIssueId)
    if (index === -1) return positionBetween(others.at(-1)?.position, undefined)
    return positionBetween(others[index - 1]?.position, others[index].position)
}

export function endOfColumn(issues: readonly IssueSummary[], status: IssueStatus): number {
    const positions = issues.filter(issue => issue.status === status).map(issue => issue.position)
    return positionBetween(positions.length ? Math.max(...positions) : undefined, undefined)
}

// The board with one issue moved, as the optimistic state shows it before the server answers.
export function moveLocally(issues: readonly IssueSummary[], issueId: string, status: IssueStatus, position: number): IssueSummary[] {
    return issues.map(issue => (issue.id === issueId ? { ...issue, status, position } : issue))
}

// Replaces the issue with the same id, or adds it: the answer of an action and a realtime row alike.
export function upsertIssue(issues: readonly IssueSummary[], next: IssueSummary): IssueSummary[] {
    const index = issues.findIndex(issue => issue.id === next.id)
    if (index === -1) return [...issues, next]
    return issues.map(issue => (issue.id === next.id ? next : issue))
}
