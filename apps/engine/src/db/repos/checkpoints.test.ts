import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

process.env.RERUN_DATA_DIR = mkdtempSync(resolve(tmpdir(), 'rerun-checkpoints-'))
process.env.RERUN_API_KEY = ''

const { afterEach, describe, expect, it, vi } = await import('vitest')
const { getLatestCheckpoint, saveCheckpoint } = await import('./checkpoints.js')

afterEach(() => {
    vi.useRealTimers()
})

describe('compaction checkpoints', () => {
    it('is null for a session without any', async () => {
        expect(await getLatestCheckpoint('agent', 'nothing')).toBeNull()
    })

    it('returns the most recently created one for the session', async () => {
        vi.useFakeTimers({ toFake: ['Date'] })
        vi.setSystemTime(new Date('2026-09-01T10:00:00.000Z'))
        await saveCheckpoint('agent', 's1', { summaryMessage: { role: 'user', content: 'first' }, throughMessageId: 'm1', throughCreatedAt: 't1' })
        vi.setSystemTime(new Date('2026-09-01T12:00:00.000Z'))
        const latest = await saveCheckpoint('agent', 's1', { summaryMessage: { role: 'user', content: 'second' }, throughMessageId: 'm2', throughCreatedAt: 't2' })
        vi.setSystemTime(new Date('2026-09-01T11:00:00.000Z'))
        await saveCheckpoint('agent', 's1', { summaryMessage: { role: 'user', content: 'middle' }, throughMessageId: 'm3', throughCreatedAt: 't3' })
        vi.setSystemTime(new Date('2026-09-02T00:00:00.000Z'))
        await saveCheckpoint('agent', 's2', { summaryMessage: { role: 'user', content: 'other' }, throughMessageId: 'm4', throughCreatedAt: 't4' })

        const found = await getLatestCheckpoint('agent', 's1')
        expect(found).toEqual(latest)
        expect(JSON.parse(found!.summaryJson)).toEqual({ role: 'user', content: 'second' })
        expect(found).toMatchObject({ throughMessageId: 'm2', throughCreatedAt: 't2', createdAt: '2026-09-01T12:00:00.000Z' })
    })
})
