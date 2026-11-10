import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

process.env.LUMVIKA_DATA_DIR = mkdtempSync(resolve(tmpdir(), 'lumvika-agent-files-'))
process.env.LUMVIKA_API_KEY = ''

const { beforeAll, describe, expect, it } = await import('vitest')
const { migrate } = await import('../../db/migrate.js')
const { insertAgentIndex } = await import('../../db/repos/agents.js')
const { workspaceDir } = await import('../../config/paths.js')
const { agentWorkspaceOf, agentFilesTools } = await import('./agent-files.js')

beforeAll(async () => {
    await migrate()
    await insertAgentIndex('delegate-1', 'scout delegate')
})

describe('agentWorkspaceOf', () => {
    it('never resolves a delegate and says when there is no one to name', async () => {
        await expect(agentWorkspaceOf('scout delegate')).rejects.toThrow('No coworker "scout delegate" on this workspace. Known handles: none.')
        await expect(agentWorkspaceOf('delegate-1')).rejects.toThrow('Known handles: none.')
    })

    it('resolves a handle with or without @ and surrounding spaces', async () => {
        await insertAgentIndex('agent-scout', 'scout')
        expect(await agentWorkspaceOf('scout')).toBe(workspaceDir('agent-scout'))
        expect(await agentWorkspaceOf('  @scout ')).toBe(workspaceDir('agent-scout'))
    })

    it('matches an id before a name', async () => {
        await insertAgentIndex('writer', 'other')
        await insertAgentIndex('agent-writer', 'writer')
        expect(await agentWorkspaceOf('writer')).toBe(workspaceDir('writer'))
        expect(await agentWorkspaceOf('@agent-writer')).toBe(workspaceDir('agent-writer'))
    })

    it('lists the known handles when the agent is unknown', async () => {
        const error = (await agentWorkspaceOf('@ghost').catch(e => e)) as Error
        expect(error.message).toMatch(/^No coworker "@ghost" on this workspace\. Known handles: /)
        expect(error.message.split('Known handles: ')[1].split(', ').sort()).toEqual(['@other', '@scout', '@writer.'].sort())
    })
})

describe('agentFilesTools', () => {
    it('writes into the named agent workspace', async () => {
        const tools = agentFilesTools()
        expect(await (tools.agent_files_write as any).execute({ agent: '@scout', path: 'n.md', content: 'hi' }, {})).toBe('Wrote 2 bytes to n.md')
        expect(await (tools.agent_files_read as any).execute({ agent: 'agent-scout', path: 'n.md' }, {})).toBe('hi')
    })
})
