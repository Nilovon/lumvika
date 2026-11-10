import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { vi } from 'vitest'

process.env.LUMVIKA_DATA_DIR = mkdtempSync(resolve(tmpdir(), 'lumvika-cli-restore-finalize-'))
process.env.LUMVIKA_API_KEY = ''

const state = vi.hoisted(() => ({ prepared: 0 }))

vi.mock('../../datadir/ladder.js', () => ({ prepareDataDir: async () => void state.prepared++ }))
vi.mock('../../agents/loader.js', () => ({ listAgentIdsOnDisk: async () => ['agent1'] }))

const { afterEach, beforeEach, describe, expect, it } = await import('vitest')
const { mkdir, rm, writeFile } = await import('node:fs/promises')
const { agentDir, scheduleFile, schedulesDir } = await import('../../config/paths.js')
const { readSchedule } = await import('../../schedules/loader.js')
const { isDue } = await import('../../schedules/cron.js')
const { restoreFinalizeCommand } = await import('./restore-finalize.js')

const NOW = '2026-10-02T12:00:00.000Z'
let out = ''

async function rawSchedule(slug: string, frontmatter: string) {
    await mkdir(schedulesDir('agent1'), { recursive: true })
    await writeFile(scheduleFile('agent1', slug), `---\n${frontmatter}\n---\n\nDo the thing.\n`)
}

beforeEach(async () => {
    state.prepared = 0
    out = ''
    await rm(agentDir('agent1'), { recursive: true, force: true })
    vi.useFakeTimers({ now: new Date(NOW), toFake: ['Date'] })
    vi.spyOn(process.stdout, 'write').mockImplementation(chunk => {
        out += String(chunk)
        return true
    })
})

afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
})

describe('lumvika restore-finalize', () => {
    it('migrates the data-dir before touching any schedule', async () => {
        await restoreFinalizeCommand()
        expect(state.prepared).toBe(1)
    })

    it('moves an overdue cron to its next genuine slot instead of firing it on boot', async () => {
        await rawSchedule('daily', "cron: '0 9 * * *'\ntimezone: UTC\nlastRunAt: '2026-09-01T09:00:00.000Z'")

        await restoreFinalizeCommand()

        const daily = await readSchedule('agent1', 'daily')
        expect(daily.lastRunAt).toBe(NOW)
        expect(daily.enabled).toBe(true)
        expect(isDue(daily, new Date(NOW))).toBe(false)
        expect(JSON.parse(out).rebaselined).toEqual({ agent1: ['daily'] })
    })

    it('retires a one-shot whose moment passed while the box was archived', async () => {
        await rawSchedule('launch', "runAt: '2026-09-15T10:00:00.000Z'")

        await restoreFinalizeCommand()

        expect(await readSchedule('agent1', 'launch')).toMatchObject({ enabled: false, lastRunAt: NOW })
    })

    it('leaves a one-shot still ahead and a disabled cron untouched', async () => {
        await rawSchedule('later', "runAt: '2026-10-20T10:00:00.000Z'")
        await rawSchedule('paused', "cron: '0 9 * * *'\nenabled: false\nlastRunAt: '2026-09-01T09:00:00.000Z'")

        await restoreFinalizeCommand()

        expect(await readSchedule('agent1', 'later')).toMatchObject({ enabled: true, lastRunAt: null })
        expect(await readSchedule('agent1', 'paused')).toMatchObject({ enabled: false, lastRunAt: '2026-09-01T09:00:00.000Z' })
        expect(JSON.parse(out).rebaselined).toEqual({})
    })
})
