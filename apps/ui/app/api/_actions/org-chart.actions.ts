'use server'

import { actorFromContext, assertAgentAccess } from '@/app/api/_auth/access'
import { requireWorkspaceContext } from '@/app/api/_auth/ownership'
import { userAuthorOf, workScopeOf } from '@/app/api/_services/work/context-scope'
import { readOrgChart, setCoworkerReporting, type CoworkerReportingInput, type OrgChartCoworker } from '@/app/api/_services/work/org-chart.service'
import { failureOf } from '@/lib/i18n/action-error'

import type { ActionResult } from './space.actions'

export async function readOrgChartAction(): Promise<ActionResult<{ coworkers: OrgChartCoworker[] }>> {
    try {
        const ctx = await requireWorkspaceContext()
        return { ok: true, coworkers: await readOrgChart(workScopeOf(ctx)) }
    } catch (err) {
        return failureOf(err)
    }
}

export async function setCoworkerReportingAction(agentId: string, input: CoworkerReportingInput): Promise<ActionResult> {
    try {
        const ctx = await requireWorkspaceContext()
        await assertAgentAccess(agentId, 'manage', actorFromContext(ctx))
        await setCoworkerReporting(workScopeOf(ctx), userAuthorOf(ctx), agentId, input)
        return { ok: true }
    } catch (err) {
        return failureOf(err)
    }
}
