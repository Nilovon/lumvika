import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

process.env.RERUN_DATA_DIR = mkdtempSync(resolve(tmpdir(), 'rerun-cx-loader-hub-'))

const { afterEach, describe, expect, it, vi } = await import('vitest')

const rerun = { id: 'rerun', config: { name: 'Rerun', provider: 'rerun', models: ['rerun-max'], extraModels: [], createdAt: '' }, env: {} } as any

async function connectedWith(hub: string, key: string) {
    vi.resetModules()
    vi.stubEnv('RERUN_HUB_BASE_URL', hub)
    vi.stubEnv('RERUN_API_KEY', key)
    const { isConnected } = await import('./loader.js')
    return isConnected(rerun)
}

afterEach(() => {
    vi.unstubAllEnvs()
})

describe('the keyless Rerun connection', () => {
    it('is connected when the box knows the hub and its key', async () => {
        expect(await connectedWith('https://hub.example.com', 'hub-key')).toBe(true)
    })

    it('is not connected without a hub URL', async () => {
        expect(await connectedWith('', 'hub-key')).toBe(false)
    })

    it('is not connected without an API key', async () => {
        expect(await connectedWith('https://hub.example.com', '')).toBe(false)
    })

    it('ignores any key sitting in its own env', async () => {
        vi.resetModules()
        vi.stubEnv('RERUN_HUB_BASE_URL', '')
        vi.stubEnv('RERUN_API_KEY', '')
        const { isConnected } = await import('./loader.js')
        expect(isConnected({ ...rerun, env: { RERUN_API_KEY: 'k', ANTHROPIC_API_KEY: 'k' } })).toBe(false)
    })
})
