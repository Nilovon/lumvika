import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeScope } from '@/test/db-fake'

const db = await vi.hoisted(async () => (await import('@/test/db-fake')).fakeDb(call => (call.table === 'agents' ? { data: [{ id: 'a', name: 'Scout' }] } : undefined)))
vi.mock('@/lib/db', async importOriginal => ({ ...(await importOriginal<object>()), ...db.helpers }))

const { emailBoardBanner } = await import('./board-banner')

const scope = fakeScope('service')

function respond(init: ResponseInit) {
    return vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('png', init))
}

describe('emailBoardBanner', () => {
    beforeEach(() => {
        vi.stubEnv('BOARD_IMAGE_SECRET', 'test-secret')
        vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
        vi.restoreAllMocks()
        vi.unstubAllEnvs()
    })

    it('links the board once it is captured, at the frame of an email scene', async () => {
        const fetch = respond({ status: 200 })

        const url = await emailBoardBanner(scope, 7, 'working', 1_000)

        expect(url).toMatch(/\/og\/board\?/)
        const params = new URL(url as string).searchParams
        expect([params.get('w'), params.get('h')]).toEqual(['520', '240'])
        expect(fetch).toHaveBeenCalledWith(url, expect.anything())
    })

    it('falls back on the usual banner when the capture service served its brand image', async () => {
        respond({ status: 200, headers: { 'X-Og-Fallback': '1' } })

        await expect(emailBoardBanner(scope, 7, 'working', 1_000)).resolves.toBeUndefined()
    })

    it('falls back on the usual banner when the capture does not come back', async () => {
        vi.spyOn(globalThis, 'fetch').mockRejectedValue(new DOMException('timed out', 'TimeoutError'))

        await expect(emailBoardBanner(scope, 7, 'working', 1_000)).resolves.toBeUndefined()
    })

    it('never throws when the board cannot be signed', async () => {
        vi.stubEnv('BOARD_IMAGE_SECRET', '')
        const fetch = respond({ status: 200 })

        await expect(emailBoardBanner(scope, 7, 'working', 1_000)).resolves.toBeUndefined()
        expect(fetch).not.toHaveBeenCalled()
    })
})
