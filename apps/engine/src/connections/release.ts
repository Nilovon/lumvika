import { readFile } from 'node:fs/promises'
import type { ConnectionUsage } from '@rerun/contracts'
import { configPath } from '../config/paths.js'
import { listAgentIdsOnDisk } from '../agents/loader.js'
import { withAgentLock } from '../agents/lock.js'
import { writeAgentConfig } from '../agents/config-write.js'
import { agentConfigSchema } from '../agents/types.js'
import { clearScheduleModel, listSchedules } from '../schedules/loader.js'
import { clearTriggerModel, listTriggers } from '../triggers/loader.js'
import { clearBoxDefault, readBoxDefault } from './default.js'

async function readAgentConfig(agentId: string) {
    return agentConfigSchema.parse(JSON.parse(await readFile(configPath(agentId), 'utf8')))
}

// What a delete moves back onto the box default model. An agent only counts when it also pinned a
// model: a `connectionId` sitting next to a null model is a leftover, that agent already follows
// the default, and naming it would describe a change nobody would see.
export async function connectionUsage(id: string): Promise<ConnectionUsage> {
    const usage: ConnectionUsage = { agents: [], automations: [], isBoxDefault: (await readBoxDefault())?.connectionId === id }
    for (const agentId of await listAgentIdsOnDisk()) {
        const config = await readAgentConfig(agentId)
        if (config.model && config.connectionId === id) usage.agents.push({ id: agentId, name: config.name })
        for (const schedule of await listSchedules(agentId)) {
            if (schedule.connectionId === id) usage.automations.push({ agentId, kind: 'schedule', slug: schedule.slug })
        }
        for (const trigger of await listTriggers(agentId)) {
            if (trigger.connectionId === id) usage.automations.push({ agentId, kind: 'trigger', slug: trigger.slug })
        }
    }
    return usage
}

// Cuts every pointer to a connection before it is removed, so the delete never has to refuse.
// `null` on all three fields is the one setting that means "run whatever the box runs", and the
// resolution ladder in `agents/availability.ts` answers for them from there.
//
// Wider than what `connectionUsage` reports: a stale `connectionId` next to a null model changes
// nothing for the agent but would be left dangling, so it goes too.
export async function releaseConnection(id: string): Promise<ConnectionUsage> {
    const usage = await connectionUsage(id)
    for (const agentId of await listAgentIdsOnDisk()) {
        const config = await readAgentConfig(agentId)
        if (config.connectionId === id) {
            await withAgentLock(agentId, async () => {
                const current = await readAgentConfig(agentId)
                await writeAgentConfig(agentId, { ...current, connectionId: null, provider: null, model: null })
            })
        }
        for (const schedule of await listSchedules(agentId)) {
            if (schedule.connectionId === id) await clearScheduleModel(agentId, schedule.slug)
        }
        for (const trigger of await listTriggers(agentId)) {
            if (trigger.connectionId === id) await clearTriggerModel(agentId, trigger.slug)
        }
    }
    if (usage.isBoxDefault) await clearBoxDefault()
    return usage
}
