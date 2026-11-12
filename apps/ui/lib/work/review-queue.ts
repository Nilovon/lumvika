import type { IssueStatus, IssueSummary, WorkAuthor } from '@lumvika/contracts'

export type WorkProjectRef = { id: string; key: string; name: string }

export type ReviewComment = { issueId: string; author: WorkAuthor; body: string; createdAt: string }

// A move of an issue from one status to another, as the activity log keeps it.
export type ReviewStatusChange = { issueId: string; actor: WorkAuthor; to: string | null; createdAt: string }

export type ReviewIssueFacts = { id: string; createdByUserId: string | null; blockedReason: string | null }

export type ReviewProjectFacts = WorkProjectRef & { leadUserId: string | null }

export type ReviewItem = {
    issue: IssueSummary
    project: WorkProjectRef
    // The caller created it or leads its project: theirs to look at first.
    mine: boolean
    // Who put it where it is (finished it, or found it blocked), when the log says so.
    handedBy: WorkAuthor | null
    handedAt: string
    lastComment: ReviewComment | null
    blockedReason: string | null
}

export type ReviewQueue = { toReview: ReviewItem[]; blocked: ReviewItem[] }

export type ReviewQueueInput = {
    issues: readonly IssueSummary[]
    facts: readonly ReviewIssueFacts[]
    comments: readonly ReviewComment[]
    statusChanges: readonly ReviewStatusChange[]
    projects: readonly ReviewProjectFacts[]
}

function latestBy<T extends { issueId: string; createdAt: string }>(rows: readonly T[], keep: (row: T) => boolean = () => true): Map<string, T> {
    const latest = new Map<string, T>()
    for (const row of rows) {
        if (!keep(row)) continue
        const known = latest.get(row.issueId)
        if (!known || known.createdAt < row.createdAt) latest.set(row.issueId, row)
    }
    return latest
}

// Mine first, then the one waiting the longest: a queue is served in the order it filled.
function compareQueue(a: ReviewItem, b: ReviewItem): number {
    if (a.mine !== b.mine) return a.mine ? -1 : 1
    return a.handedAt.localeCompare(b.handedAt)
}

export function buildReviewQueue(input: ReviewQueueInput, meId: string | null): ReviewQueue {
    const facts = new Map(input.facts.map(fact => [fact.id, fact]))
    const projects = new Map(input.projects.map(project => [project.id, project]))
    const lastComments = latestBy(input.comments)
    const statusOf = new Map(input.issues.map(issue => [issue.id, issue.status]))
    const arrivals = latestBy(input.statusChanges, change => change.to === statusOf.get(change.issueId))

    const items = input.issues.flatMap((issue): ReviewItem[] => {
        if (issue.status !== 'in_review' && issue.status !== 'blocked') return []
        const project = projects.get(issue.projectId)
        if (!project) return []
        const fact = facts.get(issue.id)
        const arrival = arrivals.get(issue.id)
        const mine = !!meId && (fact?.createdByUserId === meId || project.leadUserId === meId)
        return [
            {
                issue,
                project: { id: project.id, key: project.key, name: project.name },
                mine,
                handedBy: arrival?.actor ?? null,
                handedAt: arrival?.createdAt ?? issue.updatedAt,
                lastComment: lastComments.get(issue.id) ?? null,
                blockedReason: issue.status === 'blocked' ? (fact?.blockedReason?.trim() || null) : null,
            },
        ]
    })
    const of = (status: IssueStatus) => items.filter(item => item.issue.status === status).sort(compareQueue)
    return { toReview: of('in_review'), blocked: of('blocked') }
}
