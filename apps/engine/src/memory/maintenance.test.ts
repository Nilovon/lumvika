import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { vi } from 'vitest'

process.env.LUMVIKA_DATA_DIR = mkdtempSync(resolve(tmpdir(), 'lumvika-maintenance-'))
process.env.LUMVIKA_API_KEY = ''

const { logs } = vi.hoisted(() => ({ logs: [] as Array<{ level: string; data: Record<string, unknown>; msg: string }> }))

vi.mock('../lib/logger.js', () => {
    const at = (level: string) => (data: Record<string, unknown>, msg: string) => logs.push({ level, data, msg })
    return { logger: { warn: at('warn'), info: at('info'), error: at('error'), debug: at('debug') } }
})

const { afterEach, beforeEach, describe, expect, it } = await import('vitest')
const { rm } = await import('node:fs/promises')
const { writeMemory } = await import('./store.js')
const { listMemories } = await import('../db/repos/memories.js')
const { getSystemDb } = await import('../db/systemDb.js')
const { memoryFileExists } = await import('./files.js')
const { sweepAgentMemories, sweepMemoriesIfDue } = await import('./maintenance.js')

import type { LoadedAgent } from '../agents/types.js'

const HOUR = 3_600_000

async function writeDecayed(agentId: string, content: string): Promise<string> {
    const id = await writeMemory({ id: agentId } as LoadedAgent, content, 'task')
    const { client } = await getSystemDb(agentId)
    await client.execute({ sql: 'UPDATE memories SET last_accessed_at = ? WHERE id = ?', args: [new Date(Date.now() - 40 * 24 * HOUR).toISOString(), id] })
    return id
}

const memoryFilePath = (agentId: string, id: string) => resolve(process.env.LUMVIKA_DATA_DIR!, 'agents', agentId, 'memory', `${id}.md`)

beforeEach(() => {
    logs.length = 0
})

describe('sweepAgentMemories', () => {
    it('keeps the row and moves on when archiving one memory fails', async () => {
        const broken = await writeDecayed('sweep-fail', 'a decayed memory whose file vanished')
        const healthy = await writeDecayed('sweep-fail', 'a decayed memory with its file')
        await rm(memoryFilePath('sweep-fail', broken))
        logs.length = 0

        const archived = await sweepAgentMemories('sweep-fail')

        expect(archived).toBe(1)
        expect((await listMemories('sweep-fail')).map(r => r.id)).toEqual([broken])
        expect(memoryFileExists('sweep-fail', healthy)).toBe(false)
        const warning = logs.find(l => l.level === 'warn')
        expect(warning).toMatchObject({ msg: 'memory archive failed', data: { agent: 'sweep-fail', memory: broken } })
        expect(logs.find(l => l.level === 'info')).toMatchObject({ msg: 'archived decayed memories', data: { agent: 'sweep-fail', archived: 1 } })
    })

    it('logs nothing and returns 0 when nothing decayed', async () => {
        await writeMemory({ id: 'sweep-quiet' } as LoadedAgent, 'a fresh memory')
        logs.length = 0
        expect(await sweepAgentMemories('sweep-quiet')).toBe(0)
        expect(logs).toEqual([])
    })

    it('returns 0 for an agent with no memories', async () => {
        expect(await sweepAgentMemories('sweep-empty')).toBe(0)
    })
})

describe('sweepMemoriesIfDue', () => {
    afterEach(() => {
        vi.useRealTimers()
    })

    it('sweeps at most once per hour and survives one agent failing', async () => {
        const start = Date.now()
        vi.useFakeTimers({ toFake: ['Date'] })
        vi.setSystemTime(start)

        const first = await writeDecayed('gate-agent', 'decayed before the first sweep')
        logs.length = 0
        await sweepMemoriesIfDue(['../bad', 'gate-agent'])
        expect(memoryFileExists('gate-agent', first)).toBe(false)
        expect(logs.find(l => l.level === 'error')).toMatchObject({ msg: 'memory sweep failed', data: { agent: '../bad' } })

        const second = await writeDecayed('gate-agent', 'decayed after the first sweep')
        vi.setSystemTime(start + HOUR - 1000)
        await sweepMemoriesIfDue(['gate-agent'])
        expect(memoryFileExists('gate-agent', second)).toBe(true)

        vi.setSystemTime(start + HOUR)
        await sweepMemoriesIfDue(['gate-agent'])
        expect(memoryFileExists('gate-agent', second)).toBe(false)

        const third = await writeDecayed('gate-agent', 'decayed after the second sweep')
        vi.setSystemTime(start + HOUR + 60_000)
        await sweepMemoriesIfDue(['gate-agent'])
        expect(memoryFileExists('gate-agent', third)).toBe(true)
    })
})
