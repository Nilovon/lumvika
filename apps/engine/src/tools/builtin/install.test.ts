import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { vi } from 'vitest'

process.env.LUMVIKA_DATA_DIR = mkdtempSync(resolve(tmpdir(), 'lumvika-install-tool-'))
process.env.LUMVIKA_API_KEY = ''

const state = vi.hoisted(() => ({
    order: [] as string[],
    activated: { schedules: [] as string[], triggers: [] as string[] },
}))

vi.mock('../../agents/setup.js', () => ({
    markSetupComplete: async (id: string) => {
        state.order.push(`complete:${id}`)
        return '2026-09-30T00:00:00.000Z'
    },
}))
vi.mock('../../agents/registry.js', () => ({
    getAgent: async (id: string) => {
        state.order.push(`load:${id}`)
        return { id }
    },
}))
vi.mock('../../agents/automations.js', () => ({
    activateAutomations: async (agent: { id: string }) => {
        state.order.push(`activate:${agent.id}`)
        return state.activated
    },
}))

const { beforeEach, describe, expect, it } = await import('vitest')
const { installTools } = await import('./install.js')

const tools = installTools({ agent: { id: 'installing' } } as any)

async function complete(summary?: string) {
    return (await (tools.install_complete as any).execute({ summary }, { toolCallId: 'c', messages: [] })) as { status: string; summary: string; activated: unknown; instruction: string }
}

beforeEach(() => {
    state.order.length = 0
    state.activated = { schedules: [], triggers: [] }
})

describe('install_complete', () => {
    it('marks the setup complete before switching on the automations of the reloaded agent', async () => {
        const out = await complete('Gmail is connected.')
        expect(state.order).toEqual(['complete:installing', 'load:installing', 'activate:installing'])
        expect(out).toEqual({
            status: 'complete',
            summary: 'Gmail is connected.',
            activated: { schedules: [], triggers: [] },
            instruction: 'Setup is recorded as complete. Tell the user in one short message what they can now ask you for.',
        })
    })

    it('defaults the summary to an empty string', async () => {
        expect((await complete()).summary).toBe('')
    })

    it.each([
        [['daily'], [], '1 scheduled task switched on'],
        [['daily', 'weekly'], [], '2 scheduled tasks switched on'],
        [[], ['stripe'], '1 webhook switched on'],
        [[], ['a', 'b', 'c'], '3 webhooks switched on'],
        [['daily'], ['a', 'b'], '1 scheduled task and 2 webhooks switched on'],
    ])('names %j schedules and %j webhooks', async (schedules, triggers, phrase) => {
        state.activated = { schedules, triggers }
        const { instruction } = await complete()
        expect(instruction).toBe(`Setup is recorded as complete and ${phrase}. Tell the user in one short message what they can now ask you for, and say when the automations will next run.`)
    })
})
