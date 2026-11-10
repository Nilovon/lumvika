import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const KEYS = ['LUMVIKA_DATA_DIR', 'LUMVIKA_PORT', 'LUMVIKA_HOST', 'LUMVIKA_API_KEY', 'LUMVIKA_HUB_BASE_URL', 'LUMVIKA_LOG_LEVEL', 'LUMVIKA_CODEX_PATH']

async function freshEnv(values: Record<string, string | undefined> = {}) {
    vi.resetModules()
    for (const key of KEYS) vi.stubEnv(key, values[key])
    const { env } = await import('./env.js')
    return env
}

afterEach(() => {
    vi.unstubAllEnvs()
})

describe('env', () => {
    it('fills the defaults on an empty environment', async () => {
        const env = await freshEnv()
        expect(env()).toEqual({ LUMVIKA_DATA_DIR: resolve(homedir(), '.lumvika'), LUMVIKA_PORT: 3000, LUMVIKA_HOST: '0.0.0.0', LUMVIKA_LOG_LEVEL: 'info' })
    })

    it('reads every variable it knows', async () => {
        const env = await freshEnv({
            LUMVIKA_DATA_DIR: '/data',
            LUMVIKA_PORT: '8080',
            LUMVIKA_HOST: '127.0.0.1',
            LUMVIKA_API_KEY: 'key',
            LUMVIKA_HUB_BASE_URL: 'https://hub.example.com',
            LUMVIKA_LOG_LEVEL: 'debug',
            LUMVIKA_CODEX_PATH: '/usr/local/bin/codex',
        })
        expect(env()).toEqual({
            LUMVIKA_DATA_DIR: '/data',
            LUMVIKA_PORT: 8080,
            LUMVIKA_HOST: '127.0.0.1',
            LUMVIKA_API_KEY: 'key',
            LUMVIKA_HUB_BASE_URL: 'https://hub.example.com',
            LUMVIKA_LOG_LEVEL: 'debug',
            LUMVIKA_CODEX_PATH: '/usr/local/bin/codex',
        })
    })

    it('reads an empty hub URL as no hub, but keeps an empty API key', async () => {
        const env = await freshEnv({ LUMVIKA_HUB_BASE_URL: '', LUMVIKA_API_KEY: '' })
        expect(env().LUMVIKA_HUB_BASE_URL).toBeUndefined()
        expect(env().LUMVIKA_API_KEY).toBe('')
    })

    it('refuses an invalid hub URL, port or log level, naming the variable', async () => {
        await expect(freshEnv({ LUMVIKA_HUB_BASE_URL: 'not a url' }).then(env => env())).rejects.toThrow(/^Invalid environment: LUMVIKA_HUB_BASE_URL/)
        await expect(freshEnv({ LUMVIKA_PORT: 'eighty' }).then(env => env())).rejects.toThrow(/LUMVIKA_PORT/)
        await expect(freshEnv({ LUMVIKA_PORT: '-1' }).then(env => env())).rejects.toThrow(/LUMVIKA_PORT/)
        await expect(freshEnv({ LUMVIKA_PORT: '80.5' }).then(env => env())).rejects.toThrow(/LUMVIKA_PORT/)
        await expect(freshEnv({ LUMVIKA_LOG_LEVEL: 'verbose' }).then(env => env())).rejects.toThrow(/LUMVIKA_LOG_LEVEL/)
    })

    it('reads an empty port as 0 and refuses it', async () => {
        await expect(freshEnv({ LUMVIKA_PORT: '' }).then(env => env())).rejects.toThrow(/LUMVIKA_PORT/)
    })

    it('parses once and serves the cached value afterwards', async () => {
        const env = await freshEnv({ LUMVIKA_PORT: '4000' })
        const first = env()
        vi.stubEnv('LUMVIKA_PORT', '5000')
        expect(env()).toBe(first)
        expect(env().LUMVIKA_PORT).toBe(4000)
    })

    it('does not cache a failed parse', async () => {
        const env = await freshEnv({ LUMVIKA_LOG_LEVEL: 'verbose' })
        expect(() => env()).toThrow()
        vi.stubEnv('LUMVIKA_LOG_LEVEL', 'warn')
        expect(env().LUMVIKA_LOG_LEVEL).toBe('warn')
    })
})
