import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

process.env.RERUN_DATA_DIR = mkdtempSync(resolve(tmpdir(), 'rerun-agent-loader-'))
process.env.RERUN_API_KEY = ''

const { describe, expect, it } = await import('vitest')
const { mkdir, writeFile } = await import('node:fs/promises')
const { agentDir, agentEnvPath, agentsDir, configPath, installPath, soulPath } = await import('../config/paths.js')
const { writeAgentConfig } = await import('./config-write.js')
const { agentConfigSchema } = await import('./types.js')
const { agentExists, listAgentIdsOnDisk, loadAgentFromDisk } = await import('./loader.js')

async function agentOnDisk(id: string, config: Record<string, unknown> = { name: id }) {
    await mkdir(agentDir(id), { recursive: true })
    await writeAgentConfig(id, agentConfigSchema.parse(config))
}

describe('agent loader', () => {
    it('lists nothing before any agent exists', async () => {
        expect(await listAgentIdsOnDisk()).toEqual([])
    })

    it('loads config, soul, install and env from the folder', async () => {
        await agentOnDisk('full', { name: 'Full', description: 'Does it all', model: 'rerun-max' })
        await writeFile(soulPath('full'), 'You are Full.')
        await writeFile(installPath('full'), 'Connect things.\n')
        await writeFile(agentEnvPath('full'), 'FAL_KEY=fal\n')

        const agent = await loadAgentFromDisk('full')
        expect(agent).toMatchObject({ id: 'full', soul: 'You are Full.', install: 'Connect things.\n', env: { FAL_KEY: 'fal' } })
        expect(agent.config).toMatchObject({ name: 'Full', description: 'Does it all', kind: 'user', enabled: true })
        expect(agent.resolved).toEqual({ connection: null, provider: 'rerun', model: 'rerun-max' })
    })

    it('reads a missing soul, install and env as empty', async () => {
        await agentOnDisk('bare')
        expect(await loadAgentFromDisk('bare')).toMatchObject({ soul: '', install: '', env: {} })
    })

    it('refuses a config.json that does not match the schema', async () => {
        await mkdir(agentDir('broken'), { recursive: true })
        await writeFile(configPath('broken'), JSON.stringify({ name: 42 }))
        await expect(loadAgentFromDisk('broken')).rejects.toThrow()
    })

    it('lists only the folders holding a config.json', async () => {
        await agentOnDisk('listed')
        await mkdir(agentDir('no-config'), { recursive: true })
        await writeFile(resolve(agentsDir(), 'stray.json'), '{}')

        const ids = await listAgentIdsOnDisk()
        expect(ids).toContain('listed')
        expect(ids).not.toContain('no-config')
        expect(ids).not.toContain('stray.json')
        expect(agentExists('listed')).toBe(true)
        expect(agentExists('no-config')).toBe(false)
    })

    it('refuses an id that climbs out of the agents folder', () => {
        expect(() => agentExists('..')).toThrow(expect.objectContaining({ status: 400 }))
    })
})
