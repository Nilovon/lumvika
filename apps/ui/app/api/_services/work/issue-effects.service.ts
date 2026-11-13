import 'server-only'

import { ISSUE_CHECKOUT_STATUSES, formatIssueRef, type IssueRunFailureReason, type IssueStatus, type IssueWakeReason, type WorkAuthor } from '@lumvika/contracts'
import { after } from 'next/server'

import { hasAccess, memberActor, readAgentAccess } from '@/app/api/_auth/access'
import type { Database } from '@/app/api/database.types'
import { resolveAgentTargetForTrigger } from '@/app/api/_services/chat.service'
import { ISSUE_COLUMNS, type IssueRow } from '@/app/api/_services/work/columns'
import { sessionsPausedOnPerson } from '@/app/api/_services/work/paused-runs'
import { clientOf, type WorkScope } from '@/app/api/_services/work/refs'
import { EngineRequestError, startIssueRun } from '@/lib/engine/client'
import { PLATFORM_RELEASED } from '@/lib/features'
import { coworkerRuleOf, normalizeNotificationPrefs } from '@/lib/notifications/prefs'
import type { NotificationRecipients } from '@/lib/notifications/routing'
import { selectMany, selectMaybeSingle } from '@/supabase/supabase-helpers'

// What a change to an issue sets off once it is written: the coworker it is assigned to is woken to
// work on it, and the people who asked for it hear when a coworker hands it back for review or is
// blocked. Called by the domain services after every successful mutation, so a person's action and a
// coworker's tool call set off the same things. Never throws into the caller and never holds it up.

export type IssueChange =
    | { kind: 'created'; issueId: string; author: WorkAuthor }
    | { kind: 'assigned'; issueId: string; author: WorkAuthor }
    | { kind: 'status'; issueId: string; from: IssueStatus; author: WorkAuthor }
    | { kind: 'commented'; issueId: string; body: string; author: WorkAuthor }

export type IssueWake = { agentId: string; reason: IssueWakeReason; note?: string }

export const ISSUE_NOTIFICATION_EVENTS = { in_review: 'issue.in_review', blocked: 'issue.blocked' } as const
export const ISSUE_RUN_FAILED_EVENT = 'issue.run_failed'
type NoticeStatus = keyof typeof ISSUE_NOTIFICATION_EVENTS

type WakeView = Pick<IssueRow, 'status' | 'assignee_agent_id' | 'checkout_run_id'>

const WORKABLE = new Set<IssueStatus>(ISSUE_CHECKOUT_STATUSES)
const STARTABLE = new Set<IssueStatus>(['todo', 'in_progress'])
const COMMENT_WAKES = new Set<IssueStatus>([...ISSUE_CHECKOUT_STATUSES, 'in_review'])
const NOTE_MAX = 2000

// Whom a change wakes, if anyone. A coworker is never woken by what it did itself, nor while one of
// its runs holds the issue: that run is already on it.
export function wakeFor(change: IssueChange, issue: WakeView): IssueWake | null {
    const agentId = issue.assignee_agent_id
    if (!agentId || issue.checkout_run_id) return null
    if (change.author.kind === 'agent' && change.author.agentId === agentId) return null
    switch (change.kind) {
        case 'created':
        case 'assigned':
            return WORKABLE.has(issue.status) ? { agentId, reason: 'assigned' } : null
        case 'status':
            if (change.from === 'backlog' && issue.status === 'todo') return { agentId, reason: 'ready' }
            return STARTABLE.has(issue.status) && !STARTABLE.has(change.from) ? { agentId, reason: 'reopened' } : null
        case 'commented':
            return change.author.kind === 'user' && COMMENT_WAKES.has(issue.status) ? { agentId, reason: 'comment', note: change.body.slice(0, NOTE_MAX) } : null
    }
}

// A coworker handing work back to people: for review, or because it cannot go on without them.
export function noticeFor(change: IssueChange, issue: Pick<IssueRow, 'status'>): NoticeStatus | null {
    if (change.kind !== 'status' || change.author.kind !== 'agent') return null
    return issue.status === 'in_review' || issue.status === 'blocked' ? issue.status : null
}

const enginesWithoutIssueRuns = new Set<string>()

// What a wake came to: a run started, or why not. `no_target` is a coworker turned off or a workspace
// without a machine, `outdated` an engine older than issue runs, anything else the engine's refusal.
export type WakeOutcome = 'started' | 'no_target' | 'outdated' | (string & {})

export async function wake(issue: Pick<IssueRow, 'title'> & { ref: string }, wakeup: IssueWake): Promise<WakeOutcome> {
    const target = await resolveAgentTargetForTrigger(wakeup.agentId)
    if (!target) return 'no_target'
    try {
        const outcome = await startIssueRun(target.conn, target.engineAgentId, { ref: issue.ref, title: issue.title, reason: wakeup.reason, ...(wakeup.note ? { note: wakeup.note } : {}) })
        return outcome.started ? 'started' : outcome.reason
    } catch (err) {
        if (err instanceof EngineRequestError && err.status === 404) {
            if (!enginesWithoutIssueRuns.has(target.conn.baseUrl)) console.warn('[work] this engine cannot start issue runs yet, the coworker is not woken', { baseUrl: target.conn.baseUrl })
            enginesWithoutIssueRuns.add(target.conn.baseUrl)
            return 'outdated'
        }
        throw err
    }
}

type NotificationInsert = Database['public']['Tables']['notifications']['Insert']

async function recipientsFor(scope: WorkScope, issue: IssueRow, agentId: string): Promise<NotificationRecipients> {
    const supabase = clientOf(scope)
    const { data: project } = await selectMaybeSingle(supabase, 'projects', ['lead_user_id'] as const, { id: issue.project_id })
    const concerned = [...new Set([issue.created_by_user_id, project?.lead_user_id].filter((id): id is string => !!id))]
    if (concerned.length === 0) return {}
    const [{ data: members }, { data: users }] = await Promise.all([
        selectMany(supabase, 'workspace_members', ['user_id'] as const, { workspace_id: scope.workspaceId, user_id: concerned }),
        selectMany(supabase, 'users', ['id', 'email_notification_prefs'] as const, { id: concerned }),
    ])
    const memberIds = new Set((members ?? []).map(member => member.user_id))
    const prefsOf = new Map((users ?? []).map(user => [user.id, user.email_notification_prefs]))
    return Object.fromEntries(concerned.filter(id => memberIds.has(id) && coworkerRuleOf(normalizeNotificationPrefs(prefsOf.get(id)), agentId).mode !== 'muted').map(id => [id, 'mine' as const]))
}

type IssueNotice = { event: string; message: string; key: 'issueInReview' | 'issueBlocked' | 'issueRunFailed'; values: Record<string, string> }

// The in-app notice of the people who asked for an issue: its author and its project's lead, unless
// they muted the coworker. `sessionId` is the conversation it opens, the issue's own by default.
async function sendIssueNotice(scope: WorkScope, issue: IssueRow & { ref: string }, agentId: string, build: (agentName: string) => IssueNotice, sessionId: string | null = issue.session_id): Promise<void> {
    const recipients = await recipientsFor(scope, issue, agentId)
    if (Object.keys(recipients).length === 0) return
    const supabase = clientOf(scope)
    const [{ data: agent }, { data: session }] = await Promise.all([
        selectMaybeSingle(supabase, 'agents', ['name', 'space_id', 'engine_agent_id'] as const, { id: agentId, workspace_id: scope.workspaceId }),
        sessionId ? selectMaybeSingle(supabase, 'sessions', ['engine_session_id'] as const, { id: sessionId }) : Promise.resolve({ data: null }),
    ])
    const notice = build(agent?.name ?? 'A coworker')
    const { error } = await supabase.from('notifications').insert<NotificationInsert>({
        workspace_id: scope.workspaceId,
        space_id: agent?.space_id ?? null,
        agent_id: agentId,
        engine_agent_id: agent?.engine_agent_id ?? null,
        engine_session_id: session?.engine_session_id ?? null,
        event: notice.event,
        kind: 'info',
        source: 'issue',
        message: notice.message,
        metadata: { issueId: issue.id, issueRef: issue.ref, notice: { key: notice.key, values: notice.values } },
        recipients,
        notified_at: new Date().toISOString(),
    })
    if (error) throw new Error(`Failed to store the issue notification: ${error.message}`)
}

function notify(scope: WorkScope, issue: IssueRow & { ref: string }, agentId: string, status: NoticeStatus): Promise<void> {
    const reason = issue.blocked_reason ?? ''
    return sendIssueNotice(scope, issue, agentId, agentName => ({
        event: ISSUE_NOTIFICATION_EVENTS[status],
        message: status === 'in_review' ? `${agentName} moved ${issue.ref} "${issue.title}" to review.` : `${agentName} is blocked on ${issue.ref} "${issue.title}": ${reason}`,
        key: status === 'in_review' ? 'issueInReview' : 'issueBlocked',
        values: { agentName, ref: issue.ref, title: issue.title, reason },
    }))
}

const RUN_FAILURE_ENGLISH: Record<IssueRunFailureReason, string> = {
    no_model: 'it has no AI model it can use',
    coworker_disabled: 'it is switched off',
    cancelled: 'its run was stopped',
    failed: 'its run failed',
}

// A coworker's run on the issue ended without the work: the people who asked for it hear it once.
export function notifyRunFailed(scope: WorkScope, issue: IssueRow & { ref: string }, agentId: string, failure: { reason: IssueRunFailureReason; sessionId: string | null }): Promise<void> {
    return sendIssueNotice(
        scope,
        issue,
        agentId,
        agentName => ({
            event: ISSUE_RUN_FAILED_EVENT,
            message: `${agentName} could not work on ${issue.ref} "${issue.title}": ${RUN_FAILURE_ENGLISH[failure.reason]}.`,
            key: 'issueRunFailed',
            values: { agentName, ref: issue.ref, title: issue.title, reason: failure.reason },
        }),
        failure.sessionId,
    )
}

export async function readIssue(scope: WorkScope, issueId: string): Promise<(IssueRow & { ref: string }) | null> {
    const supabase = clientOf(scope)
    const { data: issue } = await selectMaybeSingle(supabase, 'issues', ISSUE_COLUMNS, { id: issueId, workspace_id: scope.workspaceId })
    if (!issue) return null
    const { data: project } = await selectMaybeSingle(supabase, 'projects', ['key'] as const, { id: issue.project_id })
    return { ...issue, ref: formatIssueRef(project?.key ?? '?', issue.number) }
}

// A person wakes a coworker only if they may use it: a comment or a move by someone its Box is
// closed to is kept, and sets nothing off. A coworker's or the system's change keeps its own rules.
// The heartbeat reads touches through the same rule (work-queue.service.ts).
export async function authorMayWake(scope: WorkScope, author: WorkAuthor, agentId: string): Promise<boolean> {
    if (author.kind !== 'user') return true
    const actor = await memberActor(scope.workspaceId, author.userId)
    return !!actor && hasAccess(await readAgentAccess(actor, agentId), 'use')
}

// No coworker is woken with the platform switched off, nor on an issue whose conversation waits on a
// person: that conversation goes on when they answer it, and a second run would start the work over.
export async function issueMayWake(scope: WorkScope, issue: Pick<IssueRow, 'session_id'>): Promise<boolean> {
    if (!PLATFORM_RELEASED) return false
    if (!issue.session_id) return true
    return !(await sessionsPausedOnPerson(scope, [issue.session_id])).has(issue.session_id)
}

export async function applyIssueChange(scope: WorkScope, change: IssueChange): Promise<void> {
    const issue = await readIssue(scope, change.issueId)
    if (!issue) return
    const candidate = wakeFor(change, issue)
    const wakeup = candidate && (await issueMayWake(scope, issue)) && (await authorMayWake(scope, change.author, candidate.agentId)) ? candidate : null
    const notice = noticeFor(change, issue)
    await Promise.all([
        wakeup ? wake(issue, wakeup).catch(err => console.error('[work] failed to wake the coworker', { issue: issue.ref, err: String(err) })) : null,
        notice && change.author.kind === 'agent' ? notify(scope, issue, change.author.agentId, notice).catch(err => console.error('[work] failed to notify about the issue', { issue: issue.ref, err: String(err) })) : null,
    ])
}

// After the response where there is one (a server action, a route): the change is already saved and
// the person or the coworker that made it does not wait on an engine call.
export function reactToIssueChange(scope: WorkScope, change: IssueChange): void {
    const task = () => applyIssueChange(scope, change).catch(err => console.error('[work] issue follow-up failed', err))
    try {
        after(task)
    } catch {
        void task()
    }
}
