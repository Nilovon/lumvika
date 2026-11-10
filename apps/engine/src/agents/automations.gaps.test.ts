import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

process.env.RERUN_DATA_DIR = mkdtempSync(resolve(tmpdir(), 'rerun-au-gaps-'))

const { vi } = await import('vitest')

const broken = vi.hoisted(() => ({ schedules: new Set<string>(), triggers: new Set<string>(), listSchedules: false, listTriggers: false }))

vi.mock('../schedules/loader.js', async importOriginal => {
    const original = await importOriginal<typeof import('../schedules/loader.js')>()
    return {
        ...original,
        listSchedules: async (agentId: string) => {
            if (broken.listSchedules) throw new Error('schedules folder unreadable')
            return original.listSchedules(agentId)
        },
        setScheduleEnabled: async (...args: Parameters<typeof original.setScheduleEnabled>) => {
            if (broken.schedules.has(args[1])) throw new Error('disk full')
            return original.setScheduleEnabled(...args)
        },
    }
})

vi.mock('../triggers/loader.js', async importOriginal => {
    const original = await importOriginal<typeof import('../triggers/loader.js')>()
    return {
        ...original,
        listTriggers: async (agentId: string) => {
            if (broken.listTriggers) throw new Error('triggers folder unreadable')
            return original.listTriggers(agentId)
        },
        setTriggerEnabled: async (...args: Parameters<typeof original.setTriggerEnabled>) => {
            if (broken.triggers.has(args[1])) throw new Error('disk full')
            return original.setTriggerEnabled(...args)
        },
    }
})

const { beforeEach, describe, expect, it } = await import('vitest')
const { activateAutomations } = await import('./automations.js')
const { agentConfigSchema } = await import('./types.js')
const { mkdir, rm, writeFile } = await import('node:fs/promises')
const { agentDir, scheduleFile, schedulesDir, triggerFile, triggersDir } = await import('../config/paths.js')
const { readSchedule } = await import('../schedules/loader.js')
const { readTrigger } = await import('../triggers/loader.js')

const AGENT_ID = 'automationsgaps'

const agent = { id: AGENT_ID, config: agentConfigSchema.parse({ name: 'automations', enabled: true }), soul: '', install: '', env: {} } as any

async function writeSchedule(slug: string): Promise<void> {
    await writeFile(scheduleFile(AGENT_ID, slug), `---\nname: ${slug}\ncron: 0 9 * * *\nenabled: false\n---\n\nDo the thing.`, 'utf8')
}

async function writeTrigger(slug: string): Promise<void> {
    await writeFile(triggerFile(AGENT_ID, slug), `---\nname: ${slug}\nenabled: false\ntoken: tok\n---\n\nHandle the call.`, 'utf8')
}

beforeEach(async () => {
    broken.schedules.clear()
    broken.triggers.clear()
    broken.listSchedules = false
    broken.listTriggers = false
    await rm(agentDir(AGENT_ID), { recursive: true, force: true })
    await mkdir(schedulesDir(AGENT_ID), { recursive: true })
    await mkdir(triggersDir(AGENT_ID), { recursive: true })
})

describe('activateAutomations when a write fails', () => {
    it('switches on the other schedules and does not report the one it could not', async () => {
        await writeSchedule('daily')
        await writeSchedule('weekly')
        broken.schedules.add('daily')

        const activated = await activateAutomations(agent)

        expect(activated.schedules).toEqual(['weekly'])
        expect((await readSchedule(AGENT_ID, 'daily')).enabled).toBe(false)
        expect((await readSchedule(AGENT_ID, 'weekly')).enabled).toBe(true)
    })

    it('switches on the other triggers and does not report the one it could not', async () => {
        await writeTrigger('inbound')
        await writeTrigger('stripe')
        broken.triggers.add('stripe')

        const activated = await activateAutomations(agent)

        expect(activated.triggers).toEqual(['inbound'])
        expect((await readTrigger(AGENT_ID, 'inbound')).enabled).toBe(true)
        expect((await readTrigger(AGENT_ID, 'stripe')).enabled).toBe(false)
    })

    it('still reaches the triggers when the schedules cannot be listed', async () => {
        await writeSchedule('daily')
        await writeTrigger('inbound')
        broken.listSchedules = true

        expect(await activateAutomations(agent)).toEqual({ schedules: [], triggers: ['inbound'] })
    })

    it('still reports the schedules when the triggers cannot be listed', async () => {
        await writeSchedule('daily')
        await writeTrigger('inbound')
        broken.listTriggers = true

        expect(await activateAutomations(agent)).toEqual({ schedules: ['daily'], triggers: [] })
    })
})
