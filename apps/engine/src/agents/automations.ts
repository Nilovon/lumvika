import type { ActivatedAutomations } from '@lumvika/contracts'
import { listSchedules, setScheduleEnabled } from '../schedules/loader.js'
import { listTriggers, setTriggerEnabled } from '../triggers/loader.js'
import { nowIso } from '../lib/ids.js'
import { logger } from '../lib/logger.js'
import type { LoadedAgent } from './types.js'

// What closes an installation: an agent whose folder is finally configured switches on everything
// it carries. A captured template usually arrives with its schedules off, because its author had
// switched them off while building it, and nothing else would ever turn them back on.
//
// Only what is off is touched, so a schedule the user switched off themselves after the install
// is never resurrected by a second call.
export async function activateAutomations(agent: LoadedAgent): Promise<ActivatedAutomations> {
    const activated: ActivatedAutomations = { schedules: [], triggers: [] }
    // A plan with no free slot, or a revoked template subscription, disables the agent and pauses
    // its schedules on purpose. Switching them back on here would contradict the record the
    // platform keeps of what it paused.
    if (!agent.config.enabled) return activated

    const now = nowIso()

    for (const schedule of await listSchedules(agent.id).catch(() => [])) {
        if (schedule.enabled) continue
        // A one-off whose moment has already passed would fire on the next tick, which is not what
        // finishing an installation asked for. It stays off.
        if (schedule.runAt && new Date(schedule.runAt).getTime() <= Date.now()) continue
        try {
            // Cron baselines are moved to now for the same reason the import moves them: the
            // captured `lastRunAt` is old enough that the next due slot is already in the past, and
            // the schedule would fire within a tick instead of at its next genuine occurrence.
            await setScheduleEnabled(agent.id, schedule.slug, true, schedule.cron ? now : undefined)
            activated.schedules.push(schedule.slug)
        } catch (err) {
            logger.warn({ agentId: agent.id, schedule: schedule.slug, err: String(err) }, 'schedule activation failed')
        }
    }

    for (const trigger of await listTriggers(agent.id).catch(() => [])) {
        if (trigger.enabled) continue
        try {
            await setTriggerEnabled(agent.id, trigger.slug, true)
            activated.triggers.push(trigger.slug)
        } catch (err) {
            logger.warn({ agentId: agent.id, trigger: trigger.slug, err: String(err) }, 'trigger activation failed')
        }
    }

    if (activated.schedules.length > 0 || activated.triggers.length > 0) {
        logger.info({ agentId: agent.id, ...activated }, 'automations activated')
    }

    return activated
}
