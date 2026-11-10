import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

process.env.LUMVIKA_DATA_DIR = mkdtempSync(resolve(tmpdir(), 'lumvika-agent-env-'))
process.env.LUMVIKA_API_KEY = ''

const { describe, expect, it } = await import('vitest')
const { mkdir, readFile, stat } = await import('node:fs/promises')
const { agentDir, agentEnvPath } = await import('../config/paths.js')
const { parseEnvFile, readAgentEnv, serializeEnv, writeAgentEnv } = await import('./env.js')

describe('agent env', () => {
    it('reads an agent with no .env as empty', async () => {
        expect(await readAgentEnv('noenv')).toEqual({})
    })

    it('round-trips through an owner-only .env', async () => {
        await mkdir(agentDir('keyed'), { recursive: true })
        await writeAgentEnv('keyed', { FAL_KEY: ' fal-secret ', EMPTY: '' })

        expect(await readFile(agentEnvPath('keyed'), 'utf8')).toBe('FAL_KEY=fal-secret\nEMPTY=')
        expect((await stat(agentEnvPath('keyed'))).mode & 0o777).toBe(0o600)
        expect(await readAgentEnv('keyed')).toEqual({ FAL_KEY: 'fal-secret', EMPTY: '' })
    })

    it('re-exports the env-file parser and serializer', () => {
        expect(parseEnvFile(serializeEnv({ A: '1' }))).toEqual({ A: '1' })
    })
})
