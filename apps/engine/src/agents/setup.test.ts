import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

process.env.RERUN_DATA_DIR = mkdtempSync(resolve(tmpdir(), 'rerun-agent-setup-'))
process.env.RERUN_API_KEY = ''

const { afterEach, describe, expect, it, vi } = await import('vitest')
const { mkdir, readFile, writeFile } = await import('node:fs/promises')
const { agentDir, configPath, installPath } = await import('../config/paths.js')
const { writeAgentConfig } = await import('./config-write.js')
const { agentConfigSchema } = await import('./types.js')
const { getAgent } = await import('./registry.js')
const { claimInstallSession, hasPendingSetup, markSetupComplete } = await import('./setup.js')
const { createSession } = await import('../db/repos/sessions.js')

function agent(required: boolean | null, completedAt: string | null, install: string) {
    return { config: agentConfigSchema.parse({ name: 'x', setup: { required, completedAt } }), install } as any
}

afterEach(() => {
    vi.useRealTimers()
})

describe('hasPendingSetup', () => {
    it('is pending only when required, not completed, and the instructions are there', () => {
        expect(hasPendingSetup(agent(true, null, 'Connect Gmail.'))).toBe(true)

        expect(hasPendingSetup(agent(false, null, 'Connect Gmail.'))).toBe(false)
        expect(hasPendingSetup(agent(null, null, 'Connect Gmail.'))).toBe(false)
        expect(hasPendingSetup(agent(true, '2026-09-01T00:00:00.000Z', 'Connect Gmail.'))).toBe(false)
        expect(hasPendingSetup(agent(true, null, ''))).toBe(false)
        expect(hasPendingSetup(agent(true, null, ' \n\t'))).toBe(false)
    })
})

describe('markSetupComplete', () => {
    it('stamps completedAt, keeps the rest of the config and refreshes the cached agent', async () => {
        vi.useFakeTimers({ now: new Date('2026-09-30T10:00:00.000Z'), toFake: ['Date'] })
        await mkdir(agentDir('installer'), { recursive: true })
        await writeAgentConfig('installer', agentConfigSchema.parse({ name: 'Installer', description: 'kept', setup: { required: true } }))
        const before = await getAgent('installer')
        expect(before.config.setup.completedAt).toBeNull()

        expect(await markSetupComplete('installer')).toBe('2026-09-30T10:00:00.000Z')

        const onDisk = JSON.parse(await readFile(configPath('installer'), 'utf8'))
        expect(onDisk.setup).toEqual({ required: true, completedAt: '2026-09-30T10:00:00.000Z', sessionId: null })
        expect(onDisk.description).toBe('kept')
        const after = await getAgent('installer')
        expect(after).not.toBe(before)
        expect(after.config.setup.completedAt).toBe('2026-09-30T10:00:00.000Z')
    })

    it('fails on an agent that does not exist', async () => {
        await expect(markSetupComplete('nobody')).rejects.toThrow()
    })
})

describe('claimInstallSession', () => {
    async function seedPending(id: string, setup: Record<string, unknown> = {}) {
        await mkdir(agentDir(id), { recursive: true })
        await writeAgentConfig(id, agentConfigSchema.parse({ name: id, setup: { required: true, ...setup } }))
        await writeFile(installPath(id), 'Connect Gmail.\n', 'utf8')
    }

    it('records the conversation the install starts in, and points every later start back at it', async () => {
        await seedPending('claimer')
        const create = vi.fn(() => createSession('claimer', 'Install'))

        const first = await claimInstallSession('claimer', create)
        if (!('session' in first)) throw new Error('expected a new session')
        expect((await getAgent('claimer')).config.setup.sessionId).toBe(first.session.id)

        expect(await claimInstallSession('claimer', create)).toEqual({ inFlight: first.session.id })
        expect(create).toHaveBeenCalledTimes(1)
    })

    it('gives two simultaneous starts a single install', async () => {
        await seedPending('racer')
        const create = vi.fn(() => createSession('racer', 'Install'))

        const claims = await Promise.all([claimInstallSession('racer', create), claimInstallSession('racer', create)])
        expect(create).toHaveBeenCalledTimes(1)
        expect(claims.filter(claim => 'inFlight' in claim)).toHaveLength(1)
    })

    it('starts again when the recorded conversation is gone', async () => {
        await seedPending('orphan', { sessionId: 'deleted-session' })
        const claim = await claimInstallSession('orphan', () => createSession('orphan', 'Install'))
        if (!('session' in claim)) throw new Error('expected a new session')
        expect((await getAgent('orphan')).config.setup.sessionId).toBe(claim.session.id)
    })

    it('claims nothing once the setup is complete', async () => {
        await seedPending('done', { completedAt: '2026-09-01T00:00:00.000Z' })
        const create = vi.fn(() => createSession('done', 'Hello'))
        await claimInstallSession('done', create)
        await claimInstallSession('done', create)
        expect(create).toHaveBeenCalledTimes(2)
        expect((await getAgent('done')).config.setup.sessionId).toBeNull()
    })
})
