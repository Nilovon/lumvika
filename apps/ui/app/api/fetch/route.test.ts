import { beforeEach, describe, expect, it, vi } from 'vitest'

import { authenticateEngineToken } from '@/app/api/_services/workspace-engine.service'
import { scrapePage } from '@/lib/company/firecrawl'

import { POST } from './route'

const insert = vi.fn()
const from = vi.fn(() => ({ insert }))

vi.mock('@/app/api/_services/workspace-engine.service', () => ({ authenticateEngineToken: vi.fn() }))
vi.mock('@/lib/company/firecrawl', async importOriginal => ({ ...(await importOriginal<typeof import('@/lib/company/firecrawl')>()), scrapePage: vi.fn() }))
vi.mock('@/supabase/serviceRole', () => ({ createServiceRoleClient: vi.fn(() => ({ from })) }))

const WORKSPACE_ID = 7
const PAGE_URL = 'https://www.g2.com/products/slack/reviews'

function fetchRequest({ token = 'engine-key', body = { url: PAGE_URL, directStatus: 403 } }: { token?: string | null; body?: unknown } = {}) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'x-lumvika-agent': 'surfer' }
    if (token !== null) headers.authorization = `Bearer ${token}`
    return new Request('https://lumvika.test/api/fetch', { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) })
}

describe('POST /api/fetch', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.spyOn(console, 'error').mockImplementation(() => undefined)
        vi.mocked(authenticateEngineToken).mockImplementation(async token => (token === 'engine-key' ? { workspaceId: WORKSPACE_ID, isSandbox: false } : null))
        vi.mocked(scrapePage).mockResolvedValue({ status: 200, ok: true, markdown: '# Reviews', rawHtml: '<title>Reviews</title>', pageStatus: 200 })
        insert.mockResolvedValue({ error: null })
    })

    it('refuses a request without an engine key', async () => {
        const response = await POST(fetchRequest({ token: null }))

        expect(response.status).toBe(401)
        expect(scrapePage).not.toHaveBeenCalled()
    })

    it('refuses an engine key that names no workspace', async () => {
        const response = await POST(fetchRequest({ token: 'stolen' }))

        expect(response.status).toBe(401)
        expect(scrapePage).not.toHaveBeenCalled()
    })

    it('refuses a body that is not JSON, carries no URL, or points at a private host', async () => {
        expect((await POST(fetchRequest({ body: 'not json' }))).status).toBe(400)
        expect((await POST(fetchRequest({ body: { url: 'g2.com' } }))).status).toBe(400)
        expect((await POST(fetchRequest({ body: { url: 'http://localhost:3000/admin' } }))).status).toBe(400)
        expect((await POST(fetchRequest({ body: { url: 'http://192.168.1.10/' } }))).status).toBe(400)
        expect(scrapePage).not.toHaveBeenCalled()
    })

    it('answers 503 and records nothing when no scraping key is configured', async () => {
        vi.mocked(scrapePage).mockResolvedValue(null)

        const response = await POST(fetchRequest())

        expect(response.status).toBe(503)
        expect(insert).not.toHaveBeenCalled()
    })

    it('returns the page and records the fetch under its workspace and coworker', async () => {
        const response = await POST(fetchRequest())

        expect(response.status).toBe(200)
        await expect(response.json()).resolves.toEqual({ markdown: '# Reviews', rawHtml: '<title>Reviews</title>' })
        expect(scrapePage).toHaveBeenCalledWith(PAGE_URL)
        expect(from).toHaveBeenCalledWith('web_fetch_events')
        expect(insert).toHaveBeenCalledWith(
            expect.objectContaining({ workspace_id: WORKSPACE_ID, engine_agent_id: 'surfer', url: PAGE_URL, host: 'www.g2.com', direct_status: 403, outcome: 'ok', provider_status: 200, page_status: 200, content_chars: 9 }),
        )
    })

    it('records a direct fetch that never answered with a null status', async () => {
        await POST(fetchRequest({ body: { url: PAGE_URL, directStatus: null } }))

        expect(insert).toHaveBeenCalledWith(expect.objectContaining({ direct_status: null }))
    })

    it('caps the page at 50 000 characters and its raw HTML at 1 000 000', async () => {
        vi.mocked(scrapePage).mockResolvedValue({ status: 200, ok: true, markdown: 'm'.repeat(60_000), rawHtml: 'h'.repeat(1_200_000), pageStatus: 200 })

        const { markdown, rawHtml } = (await (await POST(fetchRequest())).json()) as { markdown: string; rawHtml: string }

        expect(markdown).toHaveLength(50_000)
        expect(rawHtml).toHaveLength(1_000_000)
        expect(insert).toHaveBeenCalledWith(expect.objectContaining({ content_chars: 50_000 }))
    })

    it('answers 502 and records an empty page as empty', async () => {
        vi.mocked(scrapePage).mockResolvedValue({ status: 200, ok: true, markdown: '', rawHtml: '', pageStatus: 200 })

        const response = await POST(fetchRequest())

        expect(response.status).toBe(502)
        expect(insert).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'empty', content_chars: 0 }))
    })

    it('answers 502 and records the status when the scraper refuses the site', async () => {
        vi.mocked(scrapePage).mockResolvedValue({ status: 403, ok: false, markdown: '', rawHtml: '', pageStatus: null })

        const response = await POST(fetchRequest())

        expect(response.status).toBe(502)
        expect(insert).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'error', provider_status: 403 }))
    })

    it('still returns the page when the fetch cannot be recorded', async () => {
        insert.mockResolvedValue({ error: { message: 'relation does not exist' } })
        expect((await POST(fetchRequest())).status).toBe(200)

        insert.mockRejectedValue(new Error('network'))
        const response = await POST(fetchRequest())

        expect(response.status).toBe(200)
        await expect(response.json()).resolves.toEqual({ markdown: '# Reviews', rawHtml: '<title>Reviews</title>' })
    })
})
