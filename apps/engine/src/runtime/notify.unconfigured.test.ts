import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

process.env.LUMVIKA_DATA_DIR = mkdtempSync(resolve(tmpdir(), 'lumvika-notify-off-'))
process.env.LUMVIKA_HUB_BASE_URL = ''
process.env.LUMVIKA_API_KEY = ''

const { afterEach, describe, expect, it, vi } = await import('vitest')
const { sendNotification } = await import('./notify.js')

const originalFetch = globalThis.fetch

afterEach(() => {
    globalThis.fetch = originalFetch
})

describe('sendNotification without a hub', () => {
    it('skips delivery and never calls the network', async () => {
        const fetchMock = vi.fn()
        globalThis.fetch = fetchMock as unknown as typeof fetch

        expect(await sendNotification({ kind: 'info', agentId: 'a', message: 'm' })).toEqual({ delivered: false, reason: 'webhook not configured' })
        expect(fetchMock).not.toHaveBeenCalled()
    })
})
