import 'server-only'

import { SYSTEM_AUTHOR, formatIssueRef, type IssuePriority, type IssueStatus } from '@lumvika/contracts'

import { authorMayWake, reactToIssueChange } from '@/app/api/_services/work/issue-effects.service'
import { releaseIssue } from '@/app/api/_services/work/issues.service'
import { sessionsPausedOnPerson } from '@/app/api/_services/work/paused-runs'
import { clientOf, type WorkScope } from '@/app/api/_services/work/refs'
import { PLATFORM_RELEASED } from '@/lib/features'
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

const QUEUED_STATUSES = ['in_progress', 'todo', 'blocked', 'in_review'] as const satisfies readonly IssueStatus[]
const STATUS_RANK: Record<(typeof QUEUED_STATUSES)[number], number> = { in_progress: 0, todo: 1, blocked: 2, in_review: 3 }
const PRIORITY_RANK: Record<IssuePriority, number> = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 }

export type QueuedCoworker = { agentId: string; skipRefs: string[]; wokenAt?: Record<string, string> }
export type QueuedRun = { agentId: string; ref: string; title: string }

type Held = { id: string; checkout_run_id: string | null; checked_out_at?: string | null }

async function releaseAll(scope: WorkScope, held: Held[]): Promise<Held[]> {
    const released: Held[] = []
    for (const issue of held) {
        if (!issue.checkout_run_id) continue
        const result = await releaseIssue(scope, SYSTEM_AUTHOR, issue.id, { runId: issue.checkout_run_id })
        if (result.ok) released.push(issue)
    }
    return released
}

// Whether a person may wake a coworker, asked once per pair for a whole heartbeat: the rule of a wake
// (`authorMayWake`), so a touch by someone the coworker's Box is closed to never sets it off later.
function wakeRule(scope: WorkScope): (userId: string, agentId: string) => Promise<boolean> {
    const answers = new Map<string, Promise<boolean>>()
    return (userId, agentId) => {
        const key = `${userId}/${agentId}`
        let answer = answers.get(key)
        if (!answer) {
            answer = authorMayWake(scope, { kind: 'user', userId }, agentId)
            answers.set(key, answer)
        }
        return answer
    }
}

// A person who commented while the run held the issue was not answered by a wake (the run was on
// it), and the engine's cooldown would hold the heartbeat back for an hour: the coworker is woken for
// that comment now, through the same rules as any comment. Only a person who may use the coworker
// counts, and a comment the coworker answered in the issue before its run ended needs nothing more.
async function wakeForMissedComments(scope: WorkScope, released: Held[]): Promise<void> {
    const supabase = clientOf(scope)
    const mayWake = wakeRule(scope)
    for (const issue of released) {
        if (!issue.checked_out_at) continue
        const [{ data: personal }, { data: issueRow }] = await Promise.all([
            selectMany(supabase, 'issue_comments', ['author_user_id', 'body', 'created_at'] as const, { workspace_id: scope.workspaceId, issue_id: issue.id, author_user_id: { notNull: true }, created_at: { gt: issue.checked_out_at } }, { column: 'created_at', ascending: false }),
            selectMany(supabase, 'issues', ['assignee_agent_id'] as const, { id: issue.id, workspace_id: scope.workspaceId }),
        ])
        const assignee = issueRow?.[0]?.assignee_agent_id
        if (!assignee) continue
        let comment: NonNullable<typeof personal>[number] | undefined
        for (const candidate of personal ?? []) {
            if (candidate.author_user_id && (await mayWake(candidate.author_user_id, assignee))) {
                comment = candidate
                break
            }
        }
        if (!comment?.author_user_id) continue
        const { data: answers } = await selectMany(supabase, 'issue_comments', ['created_at'] as const, { workspace_id: scope.workspaceId, issue_id: issue.id, author_agent_id: assignee, created_at: { gt: comment.created_at } }, undefined, 1)
        if (answers?.length) continue
        reactToIssueChange(scope, { kind: 'commented', issueId: issue.id, body: comment.body, author: { kind: 'user', userId: comment.author_user_id } })
    }
}

// A run ended (the engine reported it): whatever it still held goes back on the board.
export async function releaseRunCheckouts(scope: WorkScope, runId: string): Promise<number> {
    const { data } = await selectMany(clientOf(scope), 'issues', ['id', 'checkout_run_id', 'checked_out_at'] as const, { workspace_id: scope.workspaceId, checkout_run_id: runId })
    const released = await releaseAll(scope, data ?? [])
    await wakeForMissedComments(scope, released)
    return released.length
}

// A checkout whose run is gone is let go, unless the run stopped on a person in the issue's
// conversation: it is still that run's work, and the person's answer continues it there.
export async function releaseStaleCheckouts(scope: WorkScope, liveRunIds: readonly string[], now: number): Promise<number> {
    const { data } = await selectMany(clientOf(scope), 'issues', ['id', 'checkout_run_id', 'checked_out_at', 'session_id'] as const, { workspace_id: scope.workspaceId, checkout_run_id: { notNull: true } })
    const live = new Set(liveRunIds)
    const stale = (data ?? []).filter(issue => {
        const age = now - new Date(issue.checked_out_at ?? 0).getTime()
        return age > MAX_CHECKOUT_AGE_MS || (!live.has(issue.checkout_run_id ?? '') && age > STALE_CHECKOUT_GRACE_MS)
    })
    const paused = await sessionsPausedOnPerson(scope, stale.map(issue => issue.session_id))
    return (await releaseAll(scope, stale.filter(issue => !issue.session_id || !paused.has(issue.session_id)))).length
}

type Candidate = { id: string; project_id: string; number: number; title: string; status: IssueStatus; priority: IssuePriority; due_date: string | null; position: number; assignee_agent_id: string | null; session_id: string | null }

// When the issue was last touched by its assignee, by anyone else who could have woken it (another
// coworker, the system, a person who may use the coworker), and by such a person's comment, read
// exactly per issue and actor (`issue_actor_touches`). Null for what never happened.
// `assigneeFailedAt` is the assignee's last failed run on it, one of its own touches.
export type IssueTouches = { assigneeTouchedAt: string | null; othersTouchedAt: string | null; personCommentedAt: string | null; assigneeFailedAt?: string | null }

const timeOf = (at: string | null | undefined) => (at ? new Date(at).getTime() : 0)

// Due when the coworker never touched it, when someone else acted on it since it last did, or, for
// work it can still do on its own, when it last touched it a day ago. A blocked issue waits for
// someone else to move, and one in review for a person's comment after the coworker's last touch. A
// run that failed is never started again on its own (no heartbeat, no engine restart, no daily
// nudge): only someone touching the issue after it, or Try again, sets it off. An issue whose
// touches could not be read is never handed out.
export function isDue(issue: Pick<Candidate, 'status'>, touches: IssueTouches | undefined, now: number): boolean {
    if (!touches) return false
    const own = timeOf(touches.assigneeTouchedAt)
    if (issue.status === 'in_review') return timeOf(touches.personCommentedAt) > own
    const outside = timeOf(touches.othersTouchedAt)
    if (issue.status === 'blocked') return outside > own
    if (!own || outside > own) return true
    const failedLast = !!touches.assigneeFailedAt && timeOf(touches.assigneeFailedAt) >= own
    return !failedLast && now - own > NUDGE_AFTER_MS
}

function byWorkingOrder(a: Candidate, b: Candidate): number {
    return (
        STATUS_RANK[a.status as keyof typeof STATUS_RANK] - STATUS_RANK[b.status as keyof typeof STATUS_RANK] ||
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
        (a.due_date ?? '9999-12-31').localeCompare(b.due_date ?? '9999-12-31') ||
        a.position - b.position
    )
}

const latest = (current: string | null, at: string) => (!current || timeOf(at) > timeOf(current) ? at : current)

// Every issue asked for gets its touches, empty for one nobody touched: a read that fails throws,
// so nothing is handed out on missing data.
async function readTouches(scope: WorkScope, issues: ReadonlyArray<Pick<Candidate, 'id' | 'assignee_agent_id'>>): Promise<Map<string, IssueTouches>> {
    const { data, error } = await clientOf(scope).rpc('issue_actor_touches', { p_workspace_id: scope.workspaceId, p_issue_ids: issues.map(issue => issue.id) })
    if (error) throw new Error(`Failed to read when the issues were last touched: ${error.message}`)
    const mayWake = wakeRule(scope)
    const assigneeOf = new Map(issues.map(issue => [issue.id, issue.assignee_agent_id]))
    const touches = new Map<string, IssueTouches>(issues.map(issue => [issue.id, { assigneeTouchedAt: null, othersTouchedAt: null, personCommentedAt: null, assigneeFailedAt: null }]))
    for (const row of data ?? []) {
        const assignee = assigneeOf.get(row.issue_id)
        const current = touches.get(row.issue_id)
        if (!assignee || !current) continue
        if (row.actor_agent_id === assignee) {
            if (row.action !== 'issue.created') current.assigneeTouchedAt = latest(current.assigneeTouchedAt, row.last_at)
            if (row.action === 'issue.run_failed') current.assigneeFailedAt = latest(current.assigneeFailedAt ?? null, row.last_at)
            continue
        }
        if (row.actor_user_id && !(await mayWake(row.actor_user_id, assignee))) continue
        current.othersTouchedAt = latest(current.othersTouchedAt, row.last_at)
        if (row.action === 'issue.commented' && row.actor_user_id) current.personCommentedAt = latest(current.personCommentedAt, row.last_at)
    }
    return touches
}

// The engine skips what it woke within its cooldown, unless someone other than the coworker touched
// the issue after that wake: their comment or move is new work, not a repeat.
function skippedByCooldown(coworker: QueuedCoworker | undefined, ref: string, touches: IssueTouches | undefined): boolean {
    if (!coworker) return false
    const skipped = coworker.skipRefs.some(candidate => candidate.toUpperCase() === ref)
    if (!skipped) return false
    const wokenAt = Object.entries(coworker.wokenAt ?? {}).find(([candidate]) => candidate.toUpperCase() === ref)?.[1]
    if (!wokenAt) return true
    return timeOf(touches?.othersTouchedAt) <= timeOf(wokenAt)
}

// At most one issue per coworker, in the order its inbox lists them. `agentId` is the engine's id
// on the way in and on the way out. With the platform switched off, nothing is handed out.
export async function nextIssuesFor(scope: WorkScope, coworkers: readonly QueuedCoworker[], now: number): Promise<QueuedRun[]> {
    if (!PLATFORM_RELEASED || coworkers.length === 0) return []
    const supabase = clientOf(scope)
    const { data: agents } = await selectMany(supabase, 'agents', ['id', 'engine_agent_id', 'disabled_at'] as const, { workspace_id: scope.workspaceId, engine_agent_id: coworkers.map(coworker => coworker.agentId) })
    const engineIdOf = new Map((agents ?? []).filter(agent => !agent.disabled_at && agent.engine_agent_id).map(agent => [agent.id, agent.engine_agent_id as string]))
    if (engineIdOf.size === 0) return []

    const [{ data: issues }, { data: projects }] = await Promise.all([
        selectMany(supabase, 'issues', ['id', 'project_id', 'number', 'title', 'status', 'priority', 'due_date', 'position', 'assignee_agent_id', 'session_id'] as const, {
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

    const [touchesOf, paused] = await Promise.all([readTouches(scope, open), sessionsPausedOnPerson(scope, open.map(issue => issue.session_id))])

    const coworkerOf = new Map(coworkers.map(coworker => [coworker.agentId, coworker]))
    const runs = new Map<string, QueuedRun>()
    for (const issue of [...open].sort(byWorkingOrder)) {
        const engineAgentId = engineIdOf.get(issue.assignee_agent_id ?? '')
        if (!engineAgentId || runs.has(engineAgentId)) continue
        if (issue.session_id && paused.has(issue.session_id)) continue
        const ref = formatIssueRef(keyOf.get(issue.project_id)!, issue.number)
        const touches = touchesOf.get(issue.id)
        if (skippedByCooldown(coworkerOf.get(engineAgentId), ref, touches)) continue
        if (!isDue(issue, touches, now)) continue
        runs.set(engineAgentId, { agentId: engineAgentId, ref, title: issue.title })
    }
    return [...runs.values()]
}
