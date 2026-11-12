'use server'

import { requireLightSessionActor } from '@/app/api/_auth/access'
import { visibleChannelIds, visibleProjectIds } from '@/app/api/_auth/project-access'
import { listMyWork, type MyWork } from '@/app/api/_services/work/my-work.service'
import { getWorkOverview, type WorkOverview } from '@/app/api/_services/work/overview.service'
import { failureOf } from '@/lib/i18n/action-error'
import type { ActionResult } from './space.actions'

// The landing dashboard in one round trip: what needs the caller, the projects, goals and coworkers.
export async function getWorkOverviewAction(): Promise<ActionResult<{ overview: WorkOverview }>> {
    try {
        const actor = await requireLightSessionActor()
        const [projects, channels] = await Promise.all([visibleProjectIds(actor), visibleChannelIds(actor)])
        const overview = await getWorkOverview({ workspaceId: actor.workspaceId }, actor, { projects, channels })
        return { ok: true, overview }
    } catch (err) {
        return failureOf(err)
    }
}

export async function listMyWorkAction(): Promise<ActionResult<{ work: MyWork }>> {
    try {
        const actor = await requireLightSessionActor()
        if (actor.kind !== 'user') return { ok: true, work: { assigned: [], created: [], delegated: [], projects: [] } }
        const work = await listMyWork({ workspaceId: actor.workspaceId }, actor.userId, await visibleProjectIds(actor))
        return { ok: true, work }
    } catch (err) {
        return failureOf(err)
    }
}
