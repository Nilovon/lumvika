import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

process.env.RERUN_DATA_DIR = mkdtempSync(resolve(tmpdir(), 'rerun-memory-tool-'))
process.env.RERUN_API_KEY = ''

const { describe, expect, it, vi, beforeEach } = await import('vitest')

const reconcile = vi.hoisted(() => ({ calls: [] as unknown[][], result: { id: 'reconciled', updated: false } }))
vi.mock('../../memory/reconcile.js', () => ({
    reconcileWrite: async (...args: unknown[]) => {
        reconcile.calls.push(args)
        return reconcile.result
    },
}))

const { memoryTools } = await import('./memory.js')
const { writeMemory } = await import('../../memory/store.js')
const { readMemoryFile } = await import('../../memory/files.js')
const { agentDir, soulPath } = await import('../../config/paths.js')
const { existsSync } = await import('node:fs')
const { mkdir, writeFile } = await import('node:fs/promises')

import type { LoadedAgent } from '../../agents/types.js'

const agent = { id: 'memtool' } as LoadedAgent
const tools = memoryTools({ agent, provider: 'openrouter', model: 'acme/model' } as any)

const call = (name: string, args: Record<string, unknown>) => (tools[name] as any).execute(args, { toolCallId: 'c', messages: [] }) as Promise<string>

beforeEach(() => {
    reconcile.calls = []
    reconcile.result = { id: 'reconciled', updated: false }
})

describe('memory_write', () => {
    it('overwrites the targeted memory in place when updateId exists', async () => {
        const id = await writeMemory(agent, 'The deploy day is Monday', 'fact', ['ops'])

        expect(await call('memory_write', { content: 'The deploy day is Tuesday', kind: 'note', tags: [], updateId: id })).toBe(`Updated memory ${id}`)

        const file = await readMemoryFile(resolve(agentDir(agent.id), 'memory', `${id}.md`))
        expect(file).toMatchObject({ content: 'The deploy day is Tuesday', kind: 'fact', tags: ['ops'] })
        expect(reconcile.calls).toHaveLength(0)
    })

    it('falls back to reconciliation when updateId names no memory', async () => {
        expect(await call('memory_write', { content: 'New fact', kind: 'fact', tags: ['t'], updateId: 'missing' })).toBe('Saved memory reconciled')
        expect(reconcile.calls[0]).toEqual([agent, 'New fact', 'fact', ['t'], { provider: 'openrouter', model: 'acme/model' }])
    })

    it('reports an update when reconciliation merged the fact', async () => {
        reconcile.result = { id: 'older', updated: true }
        expect(await call('memory_write', { content: 'Corrected fact', kind: 'note', tags: [] })).toBe('Updated memory older')
    })

    it('refuses an updateId that walks out of the memory folder', async () => {
        await expect(call('memory_write', { content: 'x', kind: 'note', tags: [], updateId: '../../other/SOUL' })).rejects.toThrow(/Invalid memory id/)
    })
})

describe('memory_recall', () => {
    it('lists hits with their id and kind', async () => {
        const id = await writeMemory(agent, 'The invoice template lives in Drive', 'preference')
        expect(await call('memory_recall', { query: 'invoice template', limit: 5, includeDormant: false })).toContain(`- [${id}] (preference) The invoice template lives in Drive`)
    })

    it('says so when nothing matches', async () => {
        expect(await call('memory_recall', { query: 'zzqx', limit: 5, includeDormant: false })).toBe('No relevant memories.')
    })
})

describe('memory_delete', () => {
    it('deletes the memory it names', async () => {
        const id = await writeMemory(agent, 'Short-lived fact')
        const path = resolve(agentDir(agent.id), 'memory', `${id}.md`)

        expect(await call('memory_delete', { id })).toBe(`Deleted memory ${id}`)

        expect(existsSync(path)).toBe(false)
    })

    it("cannot reach another agent's files", async () => {
        await mkdir(agentDir('victim'), { recursive: true })
        await writeFile(soulPath('victim'), '# Victim\n')

        await call('memory_delete', { id: '../../victim/SOUL' })

        expect(existsSync(soulPath('victim'))).toBe(true)
    })
})
