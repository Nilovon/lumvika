'use server'

import { requireLightSessionActor } from '@/app/api/_auth/access'
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
