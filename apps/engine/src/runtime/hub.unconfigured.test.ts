import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

process.env.RERUN_DATA_DIR = mkdtempSync(resolve(tmpdir(), 'rerun-hub-off-'))
process.env.RERUN_HUB_BASE_URL = ''
process.env.RERUN_API_KEY = ''

const { afterEach, describe, expect, it, vi } = await import('vitest')
const { callHub } = await import('./hub.js')

const originalFetch = globalThis.fetch

afterEach(() => {
    globalThis.fetch = originalFetch
})

describe('callHub without a hub', () => {
    it('throws before touching the network', async () => {
        const fetchMock = vi.fn()
        globalThis.fetch = fetchMock as unknown as typeof fetch

        await expect(callHub({ id: 'a' }, 't', {})).rejects.toThrow('the engine is not linked to a Rerun hub')
        expect(fetchMock).not.toHaveBeenCalled()
    })
})
