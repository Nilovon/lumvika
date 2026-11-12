'use server'

import type { IssueSummary } from '@lumvika/contracts'

import { requireLightSessionActor } from '@/app/api/_auth/access'
import { assertIssueAccess, visibleProjectIds } from '@/app/api/_auth/project-access'
import { toIssueSummary } from '@/app/api/_services/work/mappers'
import { approveIssue, listReviewQueue, requestChanges, unblockIssue } from '@/app/api/_services/work/review.service'
import type { IssueRecord } from '@/app/api/_services/work/issues.service'
import { failureOf } from '@/lib/i18n/action-error'
import type { ReviewQueue } from '@/lib/work/review-queue'
import type { ActionResult } from './space.actions'

type VerdictResult = ActionResult<{ issue: IssueSummary }>

function summaryOf(record: IssueRecord): IssueSummary {
    return toIssueSummary(record, record.projectKey)
}

async function verdictOf(issueId: string) {
    const { actor } = await assertIssueAccess(issueId, 'use')
    if (actor.kind !== 'user') throw new Error('A verdict is given by a person.')
    return { scope: { workspaceId: actor.workspaceId }, verdict: { issueId, author: { kind: 'user', userId: actor.userId } as const } }
}

export async function listReviewQueueAction(): Promise<ActionResult<{ queue: ReviewQueue }>> {
    try {
        const actor = await requireLightSessionActor()
        const userId = actor.kind === 'user' ? actor.userId : null
        const queue = userId ? await listReviewQueue({ workspaceId: actor.workspaceId }, userId, await visibleProjectIds(actor)) : { toReview: [], blocked: [] }
        return { ok: true, queue }
    } catch (err) {
        return failureOf(err)
    }
}

export async function approveIssueAction(issueId: string): Promise<VerdictResult> {
    try {
        const { scope, verdict } = await verdictOf(issueId)
        return { ok: true, issue: summaryOf(await approveIssue(scope, verdict)) }
    } catch (err) {
        return failureOf(err)
    }
}

export async function requestChangesAction(issueId: string, comment: string): Promise<VerdictResult> {
    try {
        const { scope, verdict } = await verdictOf(issueId)
        return { ok: true, issue: summaryOf(await requestChanges(scope, verdict, comment)) }
    } catch (err) {
        return failureOf(err)
    }
}

export async function unblockIssueAction(issueId: string, comment?: string | null): Promise<VerdictResult> {
    try {
        const { scope, verdict } = await verdictOf(issueId)
        return { ok: true, issue: summaryOf(await unblockIssue(scope, verdict, comment)) }
    } catch (err) {
        return failureOf(err)
    }
}
