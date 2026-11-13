'use server'

import { actorFromContext, assertAgentAccess, visibleAgentIds } from '@/app/api/_auth/access'
import { requireWorkspaceContext } from '@/app/api/_auth/ownership'
import { userAuthorOf, workScopeOf } from '@/app/api/_services/work/context-scope'
import { readOrgChart, setCoworkerReporting, type CoworkerReportingInput, type OrgChartCoworker } from '@/app/api/_services/work/org-chart.service'
import { failureOf } from '@/lib/i18n/action-error'

import type { ActionResult } from './space.actions'

export async function readOrgChartAction(): Promise<ActionResult<{ coworkers: OrgChartCoworker[] }>> {
    try {
        const ctx = await requireWorkspaceContext()
        return { ok: true, coworkers: await readOrgChart(workScopeOf(ctx), await visibleAgentIds(actorFromContext(ctx))) }
    } catch (err) {
        return failureOf(err)
    }
}

export async function setCoworkerReportingAction(agentId: string, input: CoworkerReportingInput): Promise<ActionResult> {
    try {
        const ctx = await requireWorkspaceContext()
        const actor = actorFromContext(ctx)
        await assertAgentAccess(agentId, 'manage', actor)
        // A manager the caller cannot see is refused as a coworker that does not exist.
        if (input.reportsToAgentId) await assertAgentAccess(input.reportsToAgentId, 'use', actor)
        await setCoworkerReporting(workScopeOf(ctx), userAuthorOf(ctx), agentId, input)
        return { ok: true }
    } catch (err) {
        return failureOf(err)
    }
}
