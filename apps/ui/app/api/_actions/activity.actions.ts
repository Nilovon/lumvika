'use server'

import type { ActivityEntityType } from '@lumvika/contracts'

import { requireLightSessionActor, visibleAgentIds } from '@/app/api/_auth/access'
import { visibleChannelIds, visibleProjectIds } from '@/app/api/_auth/project-access'
import { listActivityFeed, type ActivityFeedPage } from '@/app/api/_services/work/activity-feed.service'
import { failureOf } from '@/lib/i18n/action-error'
import type { ActionResult } from './space.actions'

export type ActivityFeedFilters = {
    projectIds?: string[]
    actorKind?: 'user' | 'agent'
    entityTypes?: ActivityEntityType[]
    // The cursor of the previous page.
    before?: string
    limit?: number
}

const FEED_PAGE = 40

// The workspace feed, newest first, a page at a time.
export async function listActivityFeedAction(filters: ActivityFeedFilters = {}): Promise<ActionResult<{ page: ActivityFeedPage }>> {
    try {
        const actor = await requireLightSessionActor()
        const [projects, channels, agents] = await Promise.all([visibleProjectIds(actor), visibleChannelIds(actor), visibleAgentIds(actor)])
        const page = await listActivityFeed(
            { workspaceId: actor.workspaceId },
            { projectIds: filters.projectIds, actorKind: filters.actorKind, entityTypes: filters.entityTypes, before: filters.before, limit: filters.limit ?? FEED_PAGE },
            projects,
            channels,
            agents,
        )
        return { ok: true, page }
    } catch (err) {
        return failureOf(err)
    }
}
