import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const HUB = 'https://lumvika.acme.com'
const TOKEN = 'rrn_pair_token'

let dataDir: string

async function freshPairing(values: Record<string, string | undefined>) {
    vi.resetModules()
    vi.stubEnv('LUMVIKA_DATA_DIR', dataDir)
    vi.stubEnv('LUMVIKA_API_KEY', undefined)
    vi.stubEnv('LUMVIKA_HUB_BASE_URL', undefined)
    vi.stubEnv('LUMVIKA_PAIR_TOKEN', undefined)
    vi.stubEnv('LUMVIKA_HUB_URL', undefined)
    vi.stubEnv('LUMVIKA_PUBLIC_URL', undefined)
    for (const [key, value] of Object.entries(values)) vi.stubEnv(key, value)
    const pairing = await import('./pairing.js')
    const { env } = await import('../config/env.js')
    return { ...pairing, env }
}

beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'lumvika-pairing-'))
})

afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.useRealTimers()
    rmSync(dataDir, { recursive: true, force: true })
})

describe('loadPairingIdentity', () => {
    it('makes up a key of its own when it is about to pair, and keeps it across restarts', async () => {
        const first = await freshPairing({ LUMVIKA_PAIR_TOKEN: TOKEN, LUMVIKA_HUB_URL: HUB })
        first.loadPairingIdentity()
        const key = first.env().LUMVIKA_API_KEY
        expect(key).toMatch(/^[0-9a-f]{64}$/)

        const second = await freshPairing({})
        second.loadPairingIdentity()
        expect(second.env().LUMVIKA_API_KEY).toBe(key)
    })

    it('leaves a server that was given a key, or that is not pairing, as it was', async () => {
        const given = await freshPairing({ LUMVIKA_API_KEY: 'given-key', LUMVIKA_PAIR_TOKEN: TOKEN })
        given.loadPairingIdentity()
        expect(given.env().LUMVIKA_API_KEY).toBe('given-key')

        const plain = await freshPairing({})
        plain.loadPairingIdentity()
        expect(plain.env().LUMVIKA_API_KEY).toBeUndefined()
        expect(existsSync(join(dataDir, 'engine.key'))).toBe(false)
    })
})

describe('pairWithHub', () => {
    it('hands its key to the app, then talks to the app where it reached it', async () => {
        const fetch = vi.fn(async () => Response.json({ workspaceId: 7, hubUrl: 'http://localhost:3000' }))
        vi.stubGlobal('fetch', fetch)
        const pairing = await freshPairing({ LUMVIKA_PAIR_TOKEN: TOKEN, LUMVIKA_HUB_URL: `${HUB}/`, LUMVIKA_PUBLIC_URL: 'http://10.0.0.5:3000' })
        pairing.loadPairingIdentity()

        await pairing.pairWithHub()

        const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
        expect(url).toBe(`${HUB}/api/engines/pair`)
        expect(JSON.parse(init.body as string)).toMatchObject({ token: TOKEN, apiKey: pairing.env().LUMVIKA_API_KEY, url: 'http://10.0.0.5:3000' })
        expect(pairing.env().LUMVIKA_HUB_BASE_URL).toBe(HUB)
        expect(JSON.parse(readFileSync(join(dataDir, 'hub.json'), 'utf8'))).toEqual({ hubUrl: HUB, workspaceId: 7 })
    })

    it('stops at a refusal, and says why', async () => {
        const fetch = vi.fn(async () => Response.json({ error: 'This pairing token has expired.' }, { status: 401 }))
        vi.stubGlobal('fetch', fetch)
        const pairing = await freshPairing({ LUMVIKA_PAIR_TOKEN: TOKEN, LUMVIKA_HUB_URL: HUB })
        pairing.loadPairingIdentity()

        await pairing.pairWithHub()

        expect(fetch).toHaveBeenCalledOnce()
        expect(existsSync(join(dataDir, 'hub.json'))).toBe(false)
        expect(pairing.env().LUMVIKA_HUB_BASE_URL).toBeUndefined()
    })

    it('asks again while the app does not answer', async () => {
        vi.useFakeTimers()
        const fetch = vi.fn().mockRejectedValueOnce(new Error('ECONNREFUSED')).mockResolvedValueOnce(Response.json({ workspaceId: 3 }))
        vi.stubGlobal('fetch', fetch)
        const pairing = await freshPairing({ LUMVIKA_PAIR_TOKEN: TOKEN, LUMVIKA_HUB_URL: HUB })
        pairing.loadPairingIdentity()

        const done = pairing.pairWithHub()
        await vi.advanceTimersByTimeAsync(5_000)
        await done

        expect(fetch).toHaveBeenCalledTimes(2)
        expect(pairing.env().LUMVIKA_HUB_BASE_URL).toBe(HUB)
    })

    it('does not pair twice', async () => {
        const fetch = vi.fn(async () => Response.json({ workspaceId: 7 }))
        vi.stubGlobal('fetch', fetch)
        const first = await freshPairing({ LUMVIKA_PAIR_TOKEN: TOKEN, LUMVIKA_HUB_URL: HUB })
        first.loadPairingIdentity()
        await first.pairWithHub()

        const again = await freshPairing({ LUMVIKA_PAIR_TOKEN: TOKEN, LUMVIKA_HUB_URL: HUB })
        again.loadPairingIdentity()
        await again.pairWithHub()

        expect(fetch).toHaveBeenCalledOnce()
        expect(again.env().LUMVIKA_HUB_BASE_URL).toBe(HUB)
    })
})
