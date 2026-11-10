import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

const dataDir = mkdtempSync(resolve(tmpdir(), 'rerun-shared-'))
process.env.RERUN_DATA_DIR = dataDir

const { describe, expect, it } = await import('vitest')
const { sharedTools } = await import('./shared.js')

const toolsA = sharedTools({ agent: { id: 'agent-a' } } as any)
const toolsB = sharedTools({ agent: { id: 'agent-b' } } as any)

async function run(tools: any, name: string, args: Record<string, unknown>): Promise<string> {
    return (await (tools[name] as any).execute(args, {} as any)) as string
}

describe('shared tools', () => {
    it('shares files between agents', async () => {
        await run(toolsA, 'shared_write', { path: 'handoff/data.txt', content: 'from a' })
        const read = await run(toolsB, 'shared_read', { path: 'handoff/data.txt' })
        expect(read).toBe('from a')
    })

    it('lists shared entries', async () => {
        const list = await run(toolsB, 'shared_list', { path: '.' })
        expect(list).toContain('handoff/')
    })

    it('edits a shared file', async () => {
        const res = await run(toolsB, 'shared_edit', { path: 'handoff/data.txt', oldString: 'from a', newString: 'edited by b' })
        expect(res).toContain('Edited')
        expect(await run(toolsA, 'shared_read', { path: 'handoff/data.txt' })).toBe('edited by b')
    })

    it('blocks paths that escape the shared root', async () => {
        await expect(run(toolsA, 'shared_write', { path: '../escape.txt', content: 'x' })).rejects.toThrow('Path escapes the root')
    })
})
