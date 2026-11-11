import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { DbAnswer } from '@/test/db-fake'

const db = await vi.hoisted(async () => (await import('@/test/db-fake')).fakeDb())
vi.mock('@/lib/db', async importOriginal => ({ ...(await importOriginal<object>()), ...db.helpers }))

const { claimPoolEngine, desktopRelayBase } = await import('./engines')

let claimed: unknown
let insert: DbAnswer

beforeEach(() => {
    claimed = null
    insert = { data: { id: 'pool-1' } }
    db.reset()
    db.answer(call => {
        if (call.table !== 'engine_pool') return undefined
        return call.helper === 'insertRow' ? insert : { data: claimed }
    })
    vi.stubEnv('LUMVIKA_ENGINE_URL', 'http://engine:3000')
    vi.stubEnv('LUMVIKA_ENGINE_API_KEY', 'compose-key')
})

afterEach(() => vi.unstubAllEnvs())

describe('claimPoolEngine', () => {
    it('gives the engine of docker compose to the first workspace that needs one', async () => {
        await expect(claimPoolEngine(4)).resolves.toEqual({ ok: true, instance: { id: 'pool-1', engineHost: 'http://engine:3000', engineApiKey: 'compose-key' } })
        expect(db.callsTo('insertRow', 'engine_pool')[0].args[0]).toMatchObject({ engine_host: 'http://engine:3000', engine_api_key: 'compose-key', claimed_by_workspace_id: 4, provider_server_id: null })
    })

    it('asks every other workspace to pair a server', async () => {
        claimed = { id: 'pool-1' }
        await expect(claimPoolEngine(5)).resolves.toMatchObject({ ok: false, raced: false })
        expect(db.callsTo('insertRow', 'engine_pool')).toHaveLength(0)
    })

    it('reads a lost race as one, for the caller to read the winner back', async () => {
        insert = { error: { code: '23505', message: 'duplicate key' } }
        await expect(claimPoolEngine(4)).resolves.toMatchObject({ ok: false, raced: true })
    })

    it('has nothing to give without a compose engine', async () => {
        vi.stubEnv('LUMVIKA_ENGINE_URL', '')
        await expect(claimPoolEngine(4)).resolves.toMatchObject({ ok: false, raced: false })
    })
})

describe('desktopRelayBase', () => {
    it('sends the browser to the address it can reach the compose engine at', async () => {
        vi.stubEnv('LUMVIKA_ENGINE_BROWSER_URL', 'https://engine.acme.com/')
        await expect(desktopRelayBase('http://engine:3000', null, null)).resolves.toBe('wss://engine.acme.com')
    })

    it('leaves any other engine to be reached on its own address', async () => {
        vi.stubEnv('LUMVIKA_ENGINE_BROWSER_URL', 'http://localhost:3001')
        await expect(desktopRelayBase('http://10.0.0.5:3000', null, null)).resolves.toBeNull()
    })
})
