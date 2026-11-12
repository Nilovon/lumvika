import 'server-only'

import type { ActivityAction, ActivityEntityType, ActivityEvent, WorkAuthor } from '@lumvika/contracts'

import type { Database, Json } from '@/app/api/database.types'
import { ACTIVITY_EVENT_COLUMNS } from '@/app/api/_services/work/columns'
import { toActivityEvent } from '@/app/api/_services/work/mappers'
import { authorColumns, clientOf, type WorkScope } from '@/app/api/_services/work/refs'
import { selectMany, type Filters } from '@/supabase/supabase-helpers'

export type ActivityInput = {
    action: ActivityAction
    entityType: ActivityEntityType
    entityId: string
    author: WorkAuthor
    projectId?: string | null
    issueId?: string | null
    metadata?: Record<string, Json | undefined>
}

// The log is a record of work that already happened: failing to write it never undoes the work, so
// the error is logged and swallowed.
export async function recordActivity(scope: WorkScope, input: ActivityInput): Promise<void> {
    const actor = authorColumns(input.author)
    const { error } = await clientOf(scope)
        .from('activity_events')
        .insert<Database['public']['Tables']['activity_events']['Insert']>({
            workspace_id: scope.workspaceId,
            project_id: input.projectId ?? null,
            issue_id: input.issueId ?? null,
            entity_type: input.entityType,
            entity_id: input.entityId,
            action: input.action,
            actor_user_id: actor.userId,
            actor_agent_id: actor.agentId,
            metadata: input.metadata ?? {},
        })
    if (error) console.error('[activity] failed to record', input.action, input.entityId, error.message)
}

export type ActivityQuery = {
    projectId?: string
    issueId?: string
    entity?: { type: ActivityEntityType; id: string }
    actorAgentId?: string
    // The createdAt of the last event of the previous page.
    before?: string
    limit?: number
}

export type ActivityPage = { events: ActivityEvent[]; nextCursor: string | null }

const DEFAULT_PAGE = 50
const MAX_PAGE = 200
// A member who sees few of the projects could otherwise page through the whole log for one screen.
const MAX_SCANNED_PAGES = 10

// Newest first. `visibleProjects` comes from `visibleProjectIds(actor)`: an event of a project the
// actor cannot see is left out, an event outside any project is kept.
export async function listActivity(scope: WorkScope, query: ActivityQuery, visibleProjects: 'all' | Set<string>): Promise<ActivityPage> {
    const limit = Math.min(Math.max(query.limit ?? DEFAULT_PAGE, 1), MAX_PAGE)
    if (query.projectId && visibleProjects !== 'all' && !visibleProjects.has(query.projectId)) return { events: [], nextCursor: null }

    const supabase = clientOf(scope)
    const events: ActivityEvent[] = []
    let before = query.before
    for (let page = 0; page < MAX_SCANNED_PAGES; page++) {
        const filters: Filters<'activity_events'> = {
            workspace_id: scope.workspaceId,
            project_id: query.projectId,
            issue_id: query.issueId,
            entity_type: query.entity?.type,
            entity_id: query.entity?.id,
            actor_agent_id: query.actorAgentId,
            created_at: before ? { lt: before } : undefined,
        }
        const { data, error } = await selectMany(supabase, 'activity_events', ACTIVITY_EVENT_COLUMNS, filters, { column: 'created_at', ascending: false }, limit + 1)
        if (error) throw new Error(`Failed to read the activity: ${error.message}`)
        const rows = data ?? []
        const pageRows = rows.slice(0, limit)
        for (const row of pageRows) {
            if (visibleProjects !== 'all' && row.project_id && !visibleProjects.has(row.project_id)) continue
            events.push(toActivityEvent(row))
            if (events.length === limit) return { events, nextCursor: row.created_at }
        }
        if (rows.length <= limit) return { events, nextCursor: null }
        before = pageRows[pageRows.length - 1].created_at
    }
    return { events, nextCursor: before ?? null }
}
