import { z } from 'zod'
import { getAgent } from '../agents/registry.js'
import { env } from '../config/env.js'
import { logger } from '../lib/logger.js'
import { fireIssueRun, issueRunInFlight, issueWokenSince } from './issue-runner.js'
import { agentHasLiveRun, liveRunIds } from './run-control.js'

const SWEEP_INTERVAL_MS = 5 * 60_000
// An issue handed to its coworker is not handed again within the hour, even when the run that took it
// left nothing behind on the board (a model that failed, a run stopped by hand).
const REWAKE_COOLDOWN_MS = 60 * 60_000
const TIMEOUT_MS = 20_000

const queueSchema = z.object({ runs: z.array(z.object({ agentId: z.string(), ref: z.string(), title: z.string() })) })

let lastSweepAt = 0
let sweeping = false

type IdleCoworker = { agentId: string; skipRefs: string[] }

async function idleCoworkers(agentIds: string[], now: number): Promise<IdleCoworker[]> {
    const idle: IdleCoworker[] = []
    for (const agentId of agentIds) {
        const agent = await getAgent(agentId).catch(() => null)
        if (!agent || agent.config.kind !== 'user' || agent.config.ephemeral || !agent.config.enabled || !agent.config.tools.work) continue
        if (agentHasLiveRun(agentId) || issueRunInFlight(agentId)) continue
        idle.push({ agentId, skipRefs: issueWokenSince(agentId, now - REWAKE_COOLDOWN_MS) })
    }
    return idle
}

// One call per box: the hub lets go of the checkouts no live run holds any more and answers, for
// each idle coworker, the issue it should take next.
export async function sweepIssueQueue(agentIds: string[], now = Date.now()): Promise<void> {
    const { LUMVIKA_HUB_BASE_URL: hub, LUMVIKA_API_KEY: token } = env()
    if (!hub || !token || agentIds.length === 0) return
    const coworkers = await idleCoworkers(agentIds, now)
    const res = await fetch(`${hub.replace(/\/$/, '')}/api/hub/work-queue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ coworkers, liveRunIds: liveRunIds() }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (res.status === 404) {
        logger.debug('the hub has no work queue yet')
        return
    }
    if (!res.ok) {
        logger.warn({ status: res.status }, 'work queue call failed')
        return
    }
    const { runs } = queueSchema.parse(await res.json())
    const idle = new Set(coworkers.map(coworker => coworker.agentId))
    for (const run of runs) {
        if (!idle.has(run.agentId)) continue
        try {
            const outcome = await fireIssueRun(run.agentId, { ref: run.ref, title: run.title, reason: 'heartbeat' })
            if (!outcome.started) logger.debug({ agent: run.agentId, issue: run.ref, reason: outcome.reason }, 'issue run skipped')
        } catch (err) {
            logger.error({ agent: run.agentId, issue: run.ref, err: String(err) }, 'issue run failed to start')
        }
    }
}

export async function sweepIssueQueueIfDue(agentIds: string[]): Promise<void> {
    const now = Date.now()
    if (sweeping || now - lastSweepAt < SWEEP_INTERVAL_MS) return
    lastSweepAt = now
    sweeping = true
    try {
        await sweepIssueQueue(agentIds, now)
    } catch (err) {
        logger.warn({ err: String(err) }, 'work queue sweep failed')
    } finally {
        sweeping = false
    }
}
