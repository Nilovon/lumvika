import { ISSUE_CHECKOUT_STATUSES, type IssueRunFailure, type IssueStatus, type IssueSummary } from '@lumvika/contracts'

const STILL_WORKABLE = new Set<IssueStatus>(ISSUE_CHECKOUT_STATUSES)

// The failed run an issue still shows, if any. The server only hands a failure that is the
// coworker's latest event on the issue; this checks what can change on screen after that: the issue
// is still assigned to that coworker, still in todo, in progress or blocked, and no run holds it
// (a checkout is a newer event of the coworker).
export function shownRunFailure(issue: Pick<IssueSummary, 'status' | 'assignee' | 'checkoutRunId' | 'runFailure'>): IssueRunFailure | null {
    const failure = issue.runFailure
    if (!failure) return null
    if (issue.assignee?.kind !== 'agent' || issue.assignee.agentId !== failure.agentId) return null
    if (!STILL_WORKABLE.has(issue.status) || issue.checkoutRunId) return null
    return failure
}

// A summary that comes without a failure read (a write's answer, a realtime row) keeps the one the
// screen knew, unless a run took the issue since.
export function keepRunFailure<T extends Pick<IssueSummary, 'checkoutRunId' | 'runFailure'>>(next: T, previous: Pick<IssueSummary, 'runFailure'> | undefined): T {
    if (next.runFailure !== undefined) return next
    if (next.checkoutRunId) return { ...next, runFailure: null }
    return previous?.runFailure === undefined ? next : { ...next, runFailure: previous.runFailure }
}
