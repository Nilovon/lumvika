import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

process.env.RERUN_DATA_DIR = mkdtempSync(resolve(tmpdir(), 'rerun-embed-nokey-'))
process.env.RERUN_API_KEY = ''
process.env.RERUN_HUB_BASE_URL = 'https://hub.example.test'

const { afterEach, describe, expect, it, vi } = await import('vitest')
const { embedBaseUrl, embedText } = await import('./embed.js')

const realFetch = globalThis.fetch

afterEach(() => {
    globalThis.fetch = realFetch
})

describe('embedText without an api key', () => {
    it('knows the hub but returns null without calling fetch', async () => {
        const fetchMock = vi.fn()
        globalThis.fetch = fetchMock as unknown as typeof fetch
        expect(embedBaseUrl()).toBe('https://hub.example.test')
        expect(await embedText('hello')).toBeNull()
        expect(fetchMock).not.toHaveBeenCalled()
    })
})
