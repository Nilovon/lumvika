import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

process.env.LUMVIKA_DATA_DIR = mkdtempSync(resolve(tmpdir(), 'lumvika-claude-sweep-'))
process.env.CLAUDE_CONFIG_DIR = mkdtempSync(resolve(tmpdir(), 'lumvika-claude-sweep-home-'))

const { afterEach, describe, expect, it, vi } = await import('vitest')
const { existsSync } = await import('node:fs')
const { mkdir, writeFile } = await import('node:fs/promises')
const { workspaceDir } = await import('../config/paths.js')
const { registerRunAbort, unregisterRunAbort } = await import('../runtime/run-control.js')
const { sweepClaudeTranscriptsIfDue } = await import('./claude-sweep.js')

const ORPHAN = '33333333-3333-4333-8333-333333333333'

async function seedOrphan(): Promise<string> {
    const dir = resolve(process.env.CLAUDE_CONFIG_DIR!, 'projects', workspaceDir('agent-1').replace(/[^a-zA-Z0-9]/g, '-'))
    await mkdir(dir, { recursive: true })
    const path = resolve(dir, `${ORPHAN}.jsonl`)
    await writeFile(path, '{}\n')
    return path
}

describe('sweepClaudeTranscriptsIfDue', () => {
    afterEach(() => vi.useRealTimers())

    it('waits for the box to be idle, sweeps once, then holds off for an hour', async () => {
        vi.useFakeTimers({ toFake: ['Date'] })
        const orphan = await seedOrphan()

        registerRunAbort('run-1', 'agent-1')
        await sweepClaudeTranscriptsIfDue()
        expect(existsSync(orphan)).toBe(true)

        unregisterRunAbort('run-1')
        await sweepClaudeTranscriptsIfDue()
        expect(existsSync(orphan)).toBe(false)

        await seedOrphan()
        vi.setSystemTime(Date.now() + 1_800_000)
        await sweepClaudeTranscriptsIfDue()
        expect(existsSync(orphan)).toBe(true)

        vi.setSystemTime(Date.now() + 1_800_000)
        await sweepClaudeTranscriptsIfDue()
        expect(existsSync(orphan)).toBe(false)
    })
})
