import { vi } from 'vitest'

const state = vi.hoisted(() => ({ schedules: [] as unknown[], asked: [] as string[] }))

vi.mock('../../schedules/loader.js', () => ({
    listSchedules: async (id: string) => {
        state.asked.push(id)
        return state.schedules
    },
}))

const { afterEach, beforeEach, describe, expect, it } = await import('vitest')
const { scheduleCommand } = await import('./schedule.js')

let out = ''

function schedule(fields: Record<string, unknown>) {
    return { slug: 's', name: 's', enabled: true, cron: null, runAt: null, timezone: null, lastRunAt: null, createdAt: '', ...fields }
}

beforeEach(() => {
    state.schedules = []
    state.asked = []
    out = ''
    vi.useFakeTimers({ now: new Date('2026-09-30T08:00:00.000Z'), toFake: ['Date'] })
    vi.spyOn(process.stdout, 'write').mockImplementation(chunk => {
        out += String(chunk)
        return true
    })
})

afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
})

describe('lumvika schedule list', () => {
    it('prints each schedule with its trigger and next run or disabled state', async () => {
        state.schedules = [
            schedule({ slug: 'daily', cron: '0 9 * * *', timezone: 'UTC' }),
            schedule({ slug: 'launch', runAt: '2026-10-01T12:00:00.000Z' }),
            schedule({ slug: 'done', runAt: '2026-09-01T12:00:00.000Z', lastRunAt: '2026-09-01T12:00:00.000Z' }),
            schedule({ slug: 'paused', cron: '0 9 * * *', enabled: false }),
        ]

        await scheduleCommand(['list', 'agent1'])

        expect(state.asked).toEqual(['agent1'])
        expect(out.split('\n')).toEqual([
            'daily\tcron 0 9 * * *\tnext 2026-09-30T09:00:00.000Z',
            'launch\tonce 2026-10-01T12:00:00.000Z\tnext 2026-10-01T12:00:00.000Z',
            'done\tonce 2026-09-01T12:00:00.000Z\tnext never',
            'paused\tcron 0 9 * * *\tdisabled',
            '',
        ])
    })

    it('prints nothing for an agent with no schedules', async () => {
        await scheduleCommand(['list', 'agent1'])
        expect(out).toBe('')
    })

    it('asks for the agent id', async () => {
        await expect(scheduleCommand(['list'])).rejects.toThrow('Usage: lumvika schedule list <agentId>')
    })

    it('prints the usage for anything else', async () => {
        await expect(scheduleCommand([])).rejects.toThrow('Usage: lumvika schedule <list>')
        await expect(scheduleCommand(['create', 'agent1'])).rejects.toThrow('Usage: lumvika schedule <list>')
    })
})
