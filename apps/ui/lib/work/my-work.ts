import { ISSUE_PRIORITIES, isIssueClosed, type IssueStatus, type IssueSummary } from '@lumvika/contracts'

// "My work" reads in the order a day is worked: what is under way, what is next, what waits on
// someone, what waits on a review, then what is parked.
export const MY_WORK_ORDER = ['in_progress', 'todo', 'blocked', 'in_review', 'backlog'] as const satisfies readonly IssueStatus[]

export const OPEN_ISSUE_STATUSES = ['backlog', 'todo', 'in_progress', 'in_review', 'blocked'] as const satisfies readonly IssueStatus[]

export type IssueGroup = { status: IssueStatus; issues: IssueSummary[] }

function newestFirst(a: IssueSummary, b: IssueSummary): number {
    return b.updatedAt.localeCompare(a.updatedAt)
}

// Urgent before low, then the nearest due date, then the issue touched last.
export function compareForWork(a: IssueSummary, b: IssueSummary): number {
    const byPriority = ISSUE_PRIORITIES.indexOf(b.priority) - ISSUE_PRIORITIES.indexOf(a.priority)
    if (byPriority !== 0) return byPriority
    if (a.dueDate !== b.dueDate) {
        if (!a.dueDate) return 1
        if (!b.dueDate) return -1
        return a.dueDate.localeCompare(b.dueDate)
    }
    return newestFirst(a, b)
}

// Only the groups that hold something; a closed issue has left the day's work.
export function groupByWorkingOrder(issues: readonly IssueSummary[]): IssueGroup[] {
    return MY_WORK_ORDER.flatMap(status => {
        const inGroup = issues.filter(issue => issue.status === status).sort(compareForWork)
        return inGroup.length > 0 ? [{ status, issues: inGroup }] : []
    })
}

export function openFirst(issues: readonly IssueSummary[]): IssueSummary[] {
    const open = issues.filter(issue => !isIssueClosed(issue.status)).sort(newestFirst)
    const closed = issues.filter(issue => isIssueClosed(issue.status)).sort(newestFirst)
    return [...open, ...closed]
}

// Several reads of the same issues, once each, the one touched last on top.
export function mergeIssues(...lists: readonly (readonly IssueSummary[])[]): IssueSummary[] {
    const byId = new Map<string, IssueSummary>()
    for (const issue of lists.flat()) {
        const known = byId.get(issue.id)
        if (!known || known.updatedAt < issue.updatedAt) byId.set(issue.id, issue)
    }
    return [...byId.values()].sort(newestFirst)
}
