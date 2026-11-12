import type { IssueRunRequest, IssueWakeReason } from '@lumvika/contracts'
import { resolveAutomationModel } from '../agents/availability.js'
import { getAgent } from '../agents/registry.js'
import type { LoadedAgent } from '../agents/types.js'
import { isPlanLimitLatched } from '../connections/plan-limits.js'
import { createSession } from '../db/repos/sessions.js'
import { logger } from '../lib/logger.js'
import { offersComputer } from '../tools/builtin/computer.js'
import { isBudgetLatched } from './budget-latch.js'
import { startHeadlessRun } from './headless-run.js'
import { sendNotification } from './notify.js'
import { agentHasLiveRun } from './run-control.js'

export type IssueRunSkip = 'disabled' | 'work_off' | 'not_a_coworker' | 'busy' | 'budget_latched' | 'subscription_limited'
export type IssueRunOutcome = { started: true; runId: string; sessionId: string } | { started: false; reason: IssueRunSkip; runId?: string }

// One issue run per coworker at a time: a second wake while one is in flight finds the issue in
// the coworker's inbox on the next heartbeat instead of racing the first run for the checkout.
const inFlight = new Map<string, { runId: string; ref: string }>()
const lastWokenAt = new Map<string, number>()
// Longer than the heartbeat's cooldown, which is all the memory is for: older wakes are forgotten so
// the map does not grow with every issue a long-lived engine ever worked.
export const WOKEN_MEMORY_MS = 2 * 60 * 60_000

function forgetWakesBefore(cutoff: number): void {
    for (const [key, at] of lastWokenAt) if (at < cutoff) lastWokenAt.delete(key)
}

export function issueRunInFlight(agentId: string): boolean {
    return inFlight.has(agentId)
}

export type IssueWake = { ref: string; at: number }

// When each issue was last handed to its coworker, so the heartbeat does not hand it again while a
// run that did nothing with it is still recent, unless someone touched it since (the hub decides).
export function issueWakesSince(agentId: string, since: number): IssueWake[] {
    forgetWakesBefore(Date.now() - WOKEN_MEMORY_MS)
    const prefix = `${agentId}/`
    return [...lastWokenAt].filter(([key, at]) => key.startsWith(prefix) && at >= since).map(([key, at]) => ({ ref: key.slice(prefix.length), at }))
}

export function rememberedWakeCount(): number {
    return lastWokenAt.size
}

const REASON_LINES: Record<IssueWakeReason, string> = {
    assigned: 'It was just assigned to you.',
    ready: 'It just moved from the backlog to todo, so it is ready to be worked.',
    reopened: 'A person moved it back into the workflow: read the latest comments to see what they expect.',
    comment: 'A person just commented on it.',
    heartbeat: 'It is waiting in your inbox.',
}

export function buildIssueRunMessage(request: IssueRunRequest): string {
    const lines = [`Work on issue ${request.ref}: "${request.title}". ${REASON_LINES[request.reason]}`]
    if (request.note) lines.push('', 'Their comment:', ...request.note.split('\n').map(line => `> ${line}`))
    lines.push(
        '',
        `1. Read it with work_get_issue ${request.ref}, then take it with work_checkout ${request.ref}. If the checkout says another run holds it, stop there.`,
        "2. Do the work, following the project's instructions, and post what matters with work_comment. Split work that is too big into sub-issues with work_create_issue and assign them.",
        '3. Finish with work_update_status: done for an issue a coworker created, in_review for any other, or blocked with who must do what when you cannot go on.',
        'If it is in_review, a person is checking your work: answer them with work_comment, and only if they ask for changes move it back with work_update_status in_progress, then take it.',
        'If a work tool says the issue was reassigned or moved by someone else, stop working on it at once.',
        '',
        'Work only on this issue in this conversation: your next issue gets a conversation of its own.',
    )
    return lines.join('\n')
}

function skipReason(agent: LoadedAgent): IssueRunSkip | null {
    if (agent.config.kind !== 'user' || agent.config.ephemeral) return 'not_a_coworker'
    if (!agent.config.enabled) return 'disabled'
    if (!agent.config.tools.work) return 'work_off'
    if (agentHasLiveRun(agent.id) && offersComputer(agent.config)) return 'busy'
    return null
}

export async function fireIssueRun(agentId: string, request: IssueRunRequest): Promise<IssueRunOutcome> {
    const running = inFlight.get(agentId)
    if (running) return { started: false, reason: 'busy', runId: running.runId }
    const agent = await getAgent(agentId)
    const skip = skipReason(agent)
    if (skip) return { started: false, reason: skip }

    const override = await resolveAutomationModel(agent)
    if (override.provider === 'lumvika' && isBudgetLatched()) return { started: false, reason: 'budget_latched' }
    if (override.connectionId && isPlanLimitLatched(override.connectionId)) return { started: false, reason: 'subscription_limited' }
    // Checked again after the awaits: two wakes arriving together must not both start a run.
    const raced = inFlight.get(agentId)
    if (raced) return { started: false, reason: 'busy', runId: raced.runId }
    inFlight.set(agentId, { runId: '', ref: request.ref })
    forgetWakesBefore(Date.now() - WOKEN_MEMORY_MS)
    lastWokenAt.set(`${agentId}/${request.ref}`, Date.now())

    try {
        const title = `${request.ref}: ${request.title}`
        const session = await createSession(agentId, title, undefined, 'issue')
        await sendNotification({ event: 'agent.session.created', kind: 'info', agentId, sessionId: session.id, runId: null, message: `Issue run: ${title}`, title, source: 'issue' })
        const { runId, settled } = await startHeadlessRun(agent, session.id, buildIssueRunMessage(request), override, { source: 'issue', slug: request.ref, name: request.title })
        inFlight.set(agentId, { runId, ref: request.ref })
        logger.info({ agent: agentId, issue: request.ref, reason: request.reason, runId, session: session.id }, 'issue run started')
        void settled
            .then(outcome => {
                if (outcome.kind === 'error') logger.error({ agent: agentId, issue: request.ref, err: outcome.error }, 'issue run failed')
            })
            .finally(() => inFlight.delete(agentId))
        return { started: true, runId, sessionId: session.id }
    } catch (err) {
        inFlight.delete(agentId)
        throw err
    }
}
