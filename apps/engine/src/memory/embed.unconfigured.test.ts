import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

process.env.LUMVIKA_DATA_DIR = mkdtempSync(resolve(tmpdir(), 'lumvika-embed-off-'))
process.env.LUMVIKA_API_KEY = 'engine-secret'
process.env.LUMVIKA_HUB_BASE_URL = ''

const { afterEach, describe, expect, it, vi } = await import('vitest')
const { embedBaseUrl, embedText } = await import('./embed.js')

const realFetch = globalThis.fetch

afterEach(() => {
    globalThis.fetch = realFetch
})

describe('embedText without a hub', () => {
    it('has no base url', () => {
        expect(embedBaseUrl()).toBeNull()
    })

    it('returns null without calling fetch', async () => {
        const fetchMock = vi.fn()
        globalThis.fetch = fetchMock as unknown as typeof fetch
        expect(await embedText('hello')).toBeNull()
        expect(fetchMock).not.toHaveBeenCalled()
    })
})
