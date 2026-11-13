'use server'

import { requireLightSessionActor } from '@/app/api/_auth/access'
import { assertIssueAccess } from '@/app/api/_auth/project-access'
import { retryIssueRun, type RetryOutcome } from '@/app/api/_services/work/issue-run-failures.service'
import { issueRunsReadiness, type IssueRunsReadiness } from '@/app/api/_services/work/issue-runs-readiness.service'
import { failureOf } from '@/lib/i18n/action-error'
import type { ActionResult } from './space.actions'

export async function issueRunsReadinessAction(): Promise<ActionResult<{ readiness: IssueRunsReadiness }>> {
    try {
        const actor = await requireLightSessionActor()
        return { ok: true, readiness: await issueRunsReadiness(actor.workspaceId) }
    } catch (err) {
        return failureOf(err)
    }
}

// Try again on an issue whose coworker run failed. A person only: a key acting for the workspace
// is no one a coworker can be used by.
export async function retryIssueRunAction(issueId: string): Promise<ActionResult<{ outcome: RetryOutcome }>> {
    try {
        const { actor } = await assertIssueAccess(issueId, 'use')
        if (actor.kind !== 'user') return { ok: true, outcome: { started: false, refusal: 'not_allowed' } }
        return { ok: true, outcome: await retryIssueRun({ workspaceId: actor.workspaceId }, actor.userId, issueId) }
    } catch (err) {
        return failureOf(err)
    }
}
