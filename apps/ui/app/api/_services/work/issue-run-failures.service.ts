import 'server-only'

import { issueRunFailureReasonSchema, parseIssueRef, type IssueRunFailure, type IssueRunFailureReason, type IssueSummary } from '@lumvika/contracts'

import { hasAccess, memberActor, readAgentAccess } from '@/app/api/_auth/access'
import type { Database } from '@/app/api/database.types'
import { failureOfRun, type TurnFailure } from '@/app/api/_services/work/channel-coworkers.service'
import { issueMayWake, notifyRunFailed, readIssue, wake } from '@/app/api/_services/work/issue-effects.service'
import { issueRunsReadiness } from '@/app/api/_services/work/issue-runs-readiness.service'
import { clientOf, type WorkScope } from '@/app/api/_services/work/refs'
import { EngineUnreachableError } from '@/lib/engine/client'
import type { NotificationPayload } from '@/lib/engine/types'
import { isRunCompletion } from '@/lib/notifications/inbound'
import { shownRunFailure } from '@/lib/work/run-failure'
import { selectMaybeSingle } from '@/supabase/supabase-helpers'

// A coworker's run on an issue that ends without the work (an error, a run someone stopped) is written
// on the issue as `issue.run_failed`, by the coworker: the issue shows it with a way back to the run's
// conversation and a Try again, the people who asked for it hear it, and the work queue counts it as
// the coworker's own touch, so nothing starts the same run again on its own.

const UNIQUE_VIOLATION = '23505'

// The reasons a channel turn tells apart that an issue run can end on.
const FAILURE_REASONS = { no_model: 'no_model', coworker_disabled: 'coworker_disabled', cancelled: 'cancelled' } as const satisfies Partial<Record<TurnFailure, IssueRunFailureReason>>

export type IssueRunEnding = { runId: string; engineAgentId: string; engineSessionId: string | null; issueRef: string; reason: IssueRunFailureReason }

function reasonOf(failure: TurnFailure | null): IssueRunFailureReason {
    return failure && failure in FAILURE_REASONS ? FAILURE_REASONS[failure as keyof typeof FAILURE_REASONS] : 'failed'
}

// The end of an issue run that did not succeed, read from the engine's webhook: the engine names the
// issue (`metadata.issueRef`) on every terminal event of an issue run, whether or not the run got as
// far as taking the issue. A run that succeeded, or any other run, is null.
export function issueRunEndingOf(payload: Pick<NotificationPayload, 'event' | 'kind' | 'agentId' | 'sessionId' | 'runId' | 'source' | 'metadata' | 'message'>): IssueRunEnding | null {
    if (!isRunCompletion(payload.event) || payload.source !== 'issue' || !payload.runId) return null
    const issueRef = typeof payload.metadata?.issueRef === 'string' ? payload.metadata.issueRef : null
    if (!issueRef || !parseIssueRef(issueRef)) return null
    const base = { runId: payload.runId, engineAgentId: payload.agentId, engineSessionId: payload.sessionId ?? null, issueRef }
    if (payload.metadata?.status === 'cancelled') return { ...base, reason: 'cancelled' }
    if (payload.kind !== 'error') return null
    const error = typeof payload.metadata?.error === 'string' ? payload.metadata.error : payload.message
    return { ...base, reason: reasonOf(failureOfRun({ status: 'error', error, output: null })) }
}

type FailureRow = Database['public']['Functions']['issue_run_failures']['Returns'][number]

function toRunFailure(row: FailureRow): IssueRunFailure | null {
    const metadata = (row.metadata ?? {}) as Record<string, unknown>
    if (typeof metadata.runId !== 'string') return null
    const reason = issueRunFailureReasonSchema.safeParse(metadata.reason)
    return { agentId: row.actor_agent_id, reason: reason.success ? reason.data : 'failed', sessionId: typeof metadata.sessionId === 'string' ? metadata.sessionId : null, runId: metadata.runId, at: row.created_at }
}

// Per issue, the failed run that is still its assignee's latest event on it.
export async function readRunFailures(scope: WorkScope, issueIds: readonly string[]): Promise<Map<string, IssueRunFailure>> {
    if (issueIds.length === 0) return new Map()
    const { data, error } = await clientOf(scope).rpc('issue_run_failures', { p_workspace_id: scope.workspaceId, p_issue_ids: [...new Set(issueIds)] })
    if (error) throw new Error(`Failed to read the failed runs of the issues: ${error.message}`)
    const failures = new Map<string, IssueRunFailure>()
    for (const row of data ?? []) {
        const failure = toRunFailure(row)
        if (failure) failures.set(row.issue_id, failure)
    }
    return failures
}

// The summaries with what their failed run is, read once for all of them. Only an issue a coworker
// holds can have one, so the others are not asked.
export async function withRunFailures<T extends IssueSummary>(scope: WorkScope, issues: T[]): Promise<T[]> {
    const candidates = issues.filter(issue => issue.assignee?.kind === 'agent').map(issue => issue.id)
    const failures = await readRunFailures(scope, candidates).catch(err => {
        console.error('[work] failed to read the failed runs', err)
        return null
    })
    if (!failures) return issues
    return issues.map(issue => ({ ...issue, runFailure: failures.get(issue.id) ?? null }))
}

export type RunFailureRecord = 'recorded' | 'already' | 'none'

// Writes the failure on its issue once per run (a unique index on the run id: the engine may report
// the same end twice, in parallel), then tells the people who asked for the issue, unless the
// coworker's previous event on it was already a failure: Try again after Try again is no news. A run
// on an issue no longer assigned to that coworker is not the issue's business any more.
export async function recordIssueRunFailure(scope: WorkScope, ending: IssueRunEnding): Promise<RunFailureRecord> {
    const supabase = clientOf(scope)
    const parsed = parseIssueRef(ending.issueRef)
    if (!parsed) return 'none'
    const [{ data: agent }, { data: project }] = await Promise.all([
        selectMaybeSingle(supabase, 'agents', ['id', 'disabled_at'] as const, { workspace_id: scope.workspaceId, engine_agent_id: ending.engineAgentId }),
        selectMaybeSingle(supabase, 'projects', ['id'] as const, { workspace_id: scope.workspaceId, key: parsed.projectKey }),
    ])
    if (!agent || !project) return 'none'
    const { data: found } = await selectMaybeSingle(supabase, 'issues', ['id'] as const, { workspace_id: scope.workspaceId, project_id: project.id, number: parsed.number })
    const issue = found ? await readIssue(scope, found.id) : null
    if (!issue || issue.assignee_agent_id !== agent.id) return 'none'

    const [{ data: session }, previous] = await Promise.all([
        ending.engineSessionId ? selectMaybeSingle(supabase, 'sessions', ['id'] as const, { agent_id: agent.id, engine_session_id: ending.engineSessionId }) : Promise.resolve({ data: null }),
        readRunFailures(scope, [issue.id]),
    ])
    const reason: IssueRunFailureReason = agent.disabled_at && ending.reason !== 'cancelled' ? 'coworker_disabled' : ending.reason
    const sessionId = session?.id ?? null

    const { error } = await supabase.from('activity_events').insert<Database['public']['Tables']['activity_events']['Insert']>({
        workspace_id: scope.workspaceId,
        project_id: issue.project_id,
        issue_id: issue.id,
        entity_type: 'issue',
        entity_id: issue.id,
        action: 'issue.run_failed',
        actor_user_id: null,
        actor_agent_id: agent.id,
        metadata: { reason, sessionId, runId: ending.runId, ref: issue.ref, title: issue.title },
    })
    if (error?.code === UNIQUE_VIOLATION) return 'already'
    if (error) throw new Error(`Failed to record the failed run: ${error.message}`)

    if (!previous.has(issue.id)) await notifyRunFailed(scope, issue, agent.id, { reason, sessionId }).catch(err => console.error('[work] failed to notify about the failed run', { issue: issue.ref, err: String(err) }))
    return 'recorded'
}

export type RetryRefusal = 'not_failed' | 'not_allowed' | 'paused' | 'no_engine' | 'outdated' | 'unreachable' | 'busy' | 'disabled' | 'refused'
export type RetryOutcome = { started: true } | { started: false; refusal: RetryRefusal }

const ENGINE_REFUSALS: Record<string, RetryRefusal> = { busy: 'busy', disabled: 'disabled', no_target: 'disabled', outdated: 'outdated' }

// Try again, on an issue whose failed run still shows: the coworker is woken the way any change wakes
// it, for a person who may use it, on a machine that can run it. Nothing is written either way: a
// refusal leaves the issue as it was, and the run that starts writes its own outcome.
export async function retryIssueRun(scope: WorkScope, userId: string, issueId: string): Promise<RetryOutcome> {
    const issue = await readIssue(scope, issueId)
    if (!issue?.assignee_agent_id) return { started: false, refusal: 'not_failed' }
    const failures = await readRunFailures(scope, [issue.id])
    const failure = shownRunFailure({ status: issue.status, assignee: { kind: 'agent', agentId: issue.assignee_agent_id }, checkoutRunId: issue.checkout_run_id, runFailure: failures.get(issue.id) ?? null })
    if (!failure) return { started: false, refusal: 'not_failed' }

    const actor = await memberActor(scope.workspaceId, userId)
    if (!actor || !hasAccess(await readAgentAccess(actor, failure.agentId), 'use')) return { started: false, refusal: 'not_allowed' }
    if (!(await issueMayWake(scope, issue))) return { started: false, refusal: 'paused' }

    const readiness = await issueRunsReadiness(scope.workspaceId)
    if (readiness !== 'ready') return { started: false, refusal: readiness }
    try {
        const outcome = await wake(issue, { agentId: failure.agentId, reason: 'heartbeat' })
        return outcome === 'started' ? { started: true } : { started: false, refusal: ENGINE_REFUSALS[outcome] ?? 'refused' }
    } catch (err) {
        if (err instanceof EngineUnreachableError) return { started: false, refusal: 'unreachable' }
        throw err
    }
}
