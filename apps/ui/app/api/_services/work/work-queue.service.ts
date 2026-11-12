import 'server-only'

import { SYSTEM_AUTHOR, formatIssueRef, type IssuePriority, type IssueStatus } from '@lumvika/contracts'

import { releaseIssue } from '@/app/api/_services/work/issues.service'
import { clientOf, type WorkScope } from '@/app/api/_services/work/refs'
import { selectMany } from '@/supabase/supabase-helpers'

// The engine's heartbeat on the board: checkouts whose run is gone are let go, and each idle coworker
// is handed the issue it should take next, if one is waiting on it.

// A run that checked an issue out a moment ago may not be in the engine's list of live runs yet.
export const STALE_CHECKOUT_GRACE_MS = 10 * 60_000
// Whatever the engine says, no run holds an issue for a day.
export const MAX_CHECKOUT_AGE_MS = 24 * 60 * 60_000
// An issue the coworker already worked on and left open is handed back once a day, unless someone
// did something on it since.
export const NUDGE_AFTER_MS = 24 * 60 * 60_000

const QUEUED_STATUSES = ['in_progress', 'todo', 'blocked'] as const satisfies readonly IssueStatus[]
const STATUS_RANK: Record<(typeof QUEUED_STATUSES)[number], number> = { in_progress: 0, todo: 1, blocked: 2 }
const PRIORITY_RANK: Record<IssuePriority, number> = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 }
// What counts as someone acting on an issue. Its creation by the assignee itself does not: a coworker
// that files work for itself expects to be handed it.
const TRACKED_ACTIONS = ['issue.created', 'issue.assigned', 'issue.status_changed', 'issue.commented', 'issue.updated', 'issue.checked_out']
const ACTIVITY_SCAN = 2000

export type QueuedCoworker = { agentId: string; skipRefs: string[] }
export type QueuedRun = { agentId: string; ref: string; title: string }

async function releaseAll(scope: WorkScope, held: Array<{ id: string; checkout_run_id: string | null }>): Promise<number> {
    let released = 0
    for (const issue of held) {
        if (!issue.checkout_run_id) continue
        const result = await releaseIssue(scope, SYSTEM_AUTHOR, issue.id, { runId: issue.checkout_run_id })
        if (result.ok) released++
    }
    return released
}

// A run ended (the engine reported it): whatever it still held goes back on the board.
export async function releaseRunCheckouts(scope: WorkScope, runId: string): Promise<number> {
    const { data } = await selectMany(clientOf(scope), 'issues', ['id', 'checkout_run_id'] as const, { workspace_id: scope.workspaceId, checkout_run_id: runId })
    return releaseAll(scope, data ?? [])
}

export async function releaseStaleCheckouts(scope: WorkScope, liveRunIds: readonly string[], now: number): Promise<number> {
    const { data } = await selectMany(clientOf(scope), 'issues', ['id', 'checkout_run_id', 'checked_out_at'] as const, { workspace_id: scope.workspaceId, checkout_run_id: { notNull: true } })
    const live = new Set(liveRunIds)
    const stale = (data ?? []).filter(issue => {
        const age = now - new Date(issue.checked_out_at ?? 0).getTime()
        return age > MAX_CHECKOUT_AGE_MS || (!live.has(issue.checkout_run_id ?? '') && age > STALE_CHECKOUT_GRACE_MS)
    })
    return releaseAll(scope, stale)
}

type Candidate = { id: string; project_id: string; number: number; title: string; status: IssueStatus; priority: IssuePriority; due_date: string | null; position: number; assignee_agent_id: string | null }
type Activity = { issue_id: string | null; action: string; actor_agent_id: string | null; created_at: string }

// Due when the coworker never touched it, when someone else acted on it since it last did, or, for
// work it can still do on its own, when it last touched it a day ago. A blocked issue waits for
// someone else to move.
export function isDue(issue: Pick<Candidate, 'status' | 'assignee_agent_id'>, activity: readonly Activity[], now: number): boolean {
    let lastTouch = 0
    let lastOutside = 0
    for (const event of activity) {
        const at = new Date(event.created_at).getTime()
        const own = event.actor_agent_id === issue.assignee_agent_id
        if (own && event.action !== 'issue.created') lastTouch = Math.max(lastTouch, at)
        else if (!own) lastOutside = Math.max(lastOutside, at)
    }
    if (!lastTouch || lastOutside > lastTouch) return true
    return issue.status !== 'blocked' && now - lastTouch > NUDGE_AFTER_MS
}

function byWorkingOrder(a: Candidate, b: Candidate): number {
    return (
        STATUS_RANK[a.status as keyof typeof STATUS_RANK] - STATUS_RANK[b.status as keyof typeof STATUS_RANK] ||
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
        (a.due_date ?? '9999-12-31').localeCompare(b.due_date ?? '9999-12-31') ||
        a.position - b.position
    )
}

// At most one issue per coworker, in the order its inbox lists them. `agentId` is the engine's id
// on the way in and on the way out.
export async function nextIssuesFor(scope: WorkScope, coworkers: readonly QueuedCoworker[], now: number): Promise<QueuedRun[]> {
    if (coworkers.length === 0) return []
    const supabase = clientOf(scope)
    const { data: agents } = await selectMany(supabase, 'agents', ['id', 'engine_agent_id', 'disabled_at'] as const, { workspace_id: scope.workspaceId, engine_agent_id: coworkers.map(coworker => coworker.agentId) })
    const engineIdOf = new Map((agents ?? []).filter(agent => !agent.disabled_at && agent.engine_agent_id).map(agent => [agent.id, agent.engine_agent_id as string]))
    if (engineIdOf.size === 0) return []

    const [{ data: issues }, { data: projects }] = await Promise.all([
        selectMany(supabase, 'issues', ['id', 'project_id', 'number', 'title', 'status', 'priority', 'due_date', 'position', 'assignee_agent_id'] as const, {
            workspace_id: scope.workspaceId,
            assignee_agent_id: [...engineIdOf.keys()],
            status: [...QUEUED_STATUSES],
            checkout_run_id: { isNull: true },
        }),
        selectMany(supabase, 'projects', ['id', 'key', 'archived_at'] as const, { workspace_id: scope.workspaceId }),
    ])
    const keyOf = new Map((projects ?? []).filter(project => !project.archived_at).map(project => [project.id, project.key]))
    const open = (issues ?? []).filter(issue => keyOf.has(issue.project_id))
    if (open.length === 0) return []

    const { data: events } = await selectMany(supabase, 'activity_events', ['issue_id', 'action', 'actor_agent_id', 'created_at'] as const, { workspace_id: scope.workspaceId, issue_id: open.map(issue => issue.id), action: TRACKED_ACTIONS }, { column: 'created_at', ascending: false }, ACTIVITY_SCAN)
    const activityOf = new Map<string, Activity[]>()
    for (const event of events ?? []) if (event.issue_id) activityOf.set(event.issue_id, [...(activityOf.get(event.issue_id) ?? []), event])

    const skipped = new Map(coworkers.map(coworker => [coworker.agentId, new Set(coworker.skipRefs.map(ref => ref.toUpperCase()))]))
    const runs = new Map<string, QueuedRun>()
    for (const issue of [...open].sort(byWorkingOrder)) {
        const engineAgentId = engineIdOf.get(issue.assignee_agent_id ?? '')
        if (!engineAgentId || runs.has(engineAgentId)) continue
        const ref = formatIssueRef(keyOf.get(issue.project_id)!, issue.number)
        if (skipped.get(engineAgentId)?.has(ref)) continue
        if (!isDue(issue, activityOf.get(issue.id) ?? [], now)) continue
        runs.set(engineAgentId, { agentId: engineAgentId, ref, title: issue.title })
    }
    return [...runs.values()]
}
