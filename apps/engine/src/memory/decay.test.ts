import { mkdtempSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

const dataDir = mkdtempSync(resolve(tmpdir(), 'rerun-decay-'))
process.env.RERUN_DATA_DIR = dataDir

const { describe, expect, it } = await import('vitest')
const { computeStrength, memoryStatus, DORMANT_THRESHOLD, ARCHIVE_THRESHOLD, HALF_LIFE_HOURS } = await import('./decay.js')
const { writeMemory, recallMemory } = await import('./store.js')
const { listMemories, bumpMemoryAccess } = await import('../db/repos/memories.js')
const { getSystemDb } = await import('../db/systemDb.js')
const { buildMemoryIndex } = await import('./index.js')
const { sweepAgentMemories } = await import('./maintenance.js')
const { memoryFileExists } = await import('./files.js')
const { nowIso } = await import('../lib/ids.js')

import type { LoadedAgent } from '../agents/types.js'

const agent = { id: 'decay-agent' } as LoadedAgent

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString()

async function backdate(id: string, lastAccessedAt: string): Promise<void> {
    const { client } = await getSystemDb(agent.id)
    await client.execute({ sql: 'UPDATE memories SET last_accessed_at = ? WHERE id = ?', args: [lastAccessedAt, id] })
}

describe('computeStrength', () => {
    it('is 1 for a fresh memory', () => {
        expect(computeStrength({ kind: 'note', createdAt: nowIso(), lastAccessedAt: null, accessCount: 0 })).toBeCloseTo(1, 2)
    })

    it('halves after one half-life', () => {
        const strength = computeStrength({ kind: 'task', createdAt: hoursAgo(HALF_LIFE_HOURS.task), lastAccessedAt: null, accessCount: 0 })
        expect(strength).toBeCloseTo(0.5, 2)
    })

    it('decays per kind: a task fades faster than a preference', () => {
        const at = hoursAgo(24 * 10)
        const task = computeStrength({ kind: 'task', createdAt: at, lastAccessedAt: null, accessCount: 0 })
        const preference = computeStrength({ kind: 'preference', createdAt: at, lastAccessedAt: null, accessCount: 0 })
        expect(task).toBeLessThan(DORMANT_THRESHOLD)
        expect(preference).toBeGreaterThan(0.9)
    })

    it('slows decay with access count', () => {
        const at = hoursAgo(24 * 10)
        const untouched = computeStrength({ kind: 'task', createdAt: at, lastAccessedAt: null, accessCount: 0 })
        const reinforced = computeStrength({ kind: 'task', createdAt: at, lastAccessedAt: at, accessCount: 7 })
        expect(reinforced).toBeGreaterThan(untouched)
    })

    it('prefers lastAccessedAt over createdAt', () => {
        const strength = computeStrength({ kind: 'task', createdAt: hoursAgo(24 * 30), lastAccessedAt: nowIso(), accessCount: 0 })
        expect(strength).toBeCloseTo(1, 2)
    })

    it('falls back to the default half-life for unknown kinds', () => {
        const strength = computeStrength({ kind: 'mystery', createdAt: hoursAgo(504), lastAccessedAt: null, accessCount: 0 })
        expect(strength).toBeCloseTo(0.5, 2)
    })

    it('maps strength to status', () => {
        expect(memoryStatus(1)).toBe('active')
        expect(memoryStatus(DORMANT_THRESHOLD - 0.01)).toBe('dormant')
    })
})

describe('recall with decay', () => {
    it('reinforces returned hits on full recall', async () => {
        const id = await writeMemory(agent, 'the deploy pipeline runs on railway', 'fact')
        await recallMemory(agent, 'deploy pipeline railway', 5, { reinforce: 'full' })
        const row = (await listMemories(agent.id)).find(r => r.id === id)
        expect(row?.accessCount).toBe(1)
        expect(row?.lastAccessedAt).not.toBeNull()
    })

    it('touch refreshes recency without incrementing accessCount', async () => {
        const id = await writeMemory(agent, 'the staging server lives on hetzner', 'fact')
        await recallMemory(agent, 'staging server hetzner', 5, { reinforce: 'touch' })
        const row = (await listMemories(agent.id)).find(r => r.id === id)
        expect(row?.accessCount).toBe(0)
    })

    it('none leaves stats untouched', async () => {
        const id = await writeMemory(agent, 'the backup bucket is on scaleway', 'fact')
        const before = (await listMemories(agent.id)).find(r => r.id === id)
        await recallMemory(agent, 'backup bucket scaleway', 5, { reinforce: 'none' })
        const after = (await listMemories(agent.id)).find(r => r.id === id)
        expect(after?.accessCount).toBe(before?.accessCount)
        expect(after?.lastAccessedAt).toBe(before?.lastAccessedAt)
    })

    it('excludes dormant memories unless includeDormant', async () => {
        const id = await writeMemory(agent, 'the legacy cron job uses jenkins', 'task')
        await backdate(id, hoursAgo(24 * 10))
        const hidden = await recallMemory(agent, 'legacy cron jenkins', 5, { reinforce: 'none' })
        expect(hidden.map(h => h.id)).not.toContain(id)
        const shown = await recallMemory(agent, 'legacy cron jenkins', 5, { reinforce: 'none', includeDormant: true })
        expect(shown.map(h => h.id)).toContain(id)
    })

    it('ranks a fresh memory above a decayed one and returns tags and strength', async () => {
        const fresh = await writeMemory(agent, 'the metrics dashboard shows grafana panels', 'note', ['monitoring'])
        const stale = await writeMemory(agent, 'the metrics dashboard shows grafana graphs', 'note')
        await backdate(stale, hoursAgo(400))
        const hits = await recallMemory(agent, 'metrics dashboard grafana', 5, { reinforce: 'none' })
        const ids = hits.map(h => h.id)
        expect(ids.indexOf(fresh)).toBeLessThan(ids.indexOf(stale))
        const freshHit = hits.find(h => h.id === fresh)
        expect(freshHit?.tags).toEqual(['monitoring'])
        expect(freshHit?.strength).toBeGreaterThan(0.9)
    })

    it('bumpMemoryAccess is a no-op on empty ids', async () => {
        await expect(bumpMemoryAccess(agent.id, [], 'full')).resolves.toBeUndefined()
    })
})

describe('memory index', () => {
    it('hides dormant memories and mentions their count', async () => {
        const id = await writeMemory(agent, 'an obsolete reminder about the old vpn', 'task')
        await backdate(id, hoursAgo(24 * 10))
        const index = await buildMemoryIndex(agent.id)
        expect(index).not.toContain('obsolete reminder about the old vpn')
        expect(index).toMatch(/\d+ dormant (memory is|memories are) not listed/)
    })
})

describe('maintenance sweep', () => {
    it('archives memories below the archive threshold', async () => {
        const dead = await writeMemory(agent, 'a long forgotten scratch note', 'task')
        await backdate(dead, hoursAgo(24 * 40))
        const strength = computeStrength({ kind: 'task', createdAt: hoursAgo(24 * 40), lastAccessedAt: hoursAgo(24 * 40), accessCount: 0 })
        expect(strength).toBeLessThan(ARCHIVE_THRESHOLD)

        const archived = await sweepAgentMemories(agent.id)
        expect(archived).toBeGreaterThanOrEqual(1)
        expect(memoryFileExists(agent.id, dead)).toBe(false)
        expect(existsSync(resolve(dataDir, 'agents', agent.id, 'memory', 'archive', `${dead}.md`))).toBe(true)
        expect((await listMemories(agent.id)).map(r => r.id)).not.toContain(dead)
    })

    it('keeps healthy memories in place', async () => {
        const alive = await writeMemory(agent, 'a healthy recent memory', 'note')
        await sweepAgentMemories(agent.id)
        expect(memoryFileExists(agent.id, alive)).toBe(true)
    })
})
