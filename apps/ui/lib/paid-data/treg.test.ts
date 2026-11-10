import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { callTregCapability } from './treg'

const originalToken = process.env.TREG_API_TOKEN
const fetchMock = vi.fn()

function tregResponse(body: unknown, { status = 200, cost = '0', servedBy = 'hunter' }: { status?: number; cost?: string; servedBy?: string } = {}) {
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'x-treg-cost-micro': cost, 'x-treg-served-by': servedBy, 'x-treg-call-id': 'call_1' } })
}

describe('callTregCapability', () => {
    beforeEach(() => {
        process.env.TREG_API_TOKEN = 'treg-token'
        fetchMock.mockReset()
        vi.stubGlobal('fetch', fetchMock)
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        if (originalToken === undefined) delete process.env.TREG_API_TOKEN
        else process.env.TREG_API_TOKEN = originalToken
    })

    it('returns null without a token', async () => {
        delete process.env.TREG_API_TOKEN

        expect(await callTregCapability('people.email.find', {}, { workspaceId: 1, agentId: null })).toBeNull()
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('posts the params to the routed capability with the token, the tags and the email verification', async () => {
        fetchMock.mockResolvedValue(tregResponse({ output: { email: 'jane@acme.com' }, raw: {}, _treg: {} }, { cost: '24500' }))

        await callTregCapability('people.email.find', { full_name: 'Jane Doe', domain: 'acme.com' }, { workspaceId: 42, agentId: 'prospector' })

        const [url, init] = fetchMock.mock.calls[0]
        expect(url).toBe('https://treg.to/call/treg.people.email.find')
        expect(init.method).toBe('POST')
        expect(JSON.parse(init.body)).toEqual({ full_name: 'Jane Doe', domain: 'acme.com' })
        expect(init.headers).toMatchObject({ 'X-Treg-Token': 'treg-token', 'X-Treg-Meta': 'customer=ws_42, agent=prospector', 'X-Treg-Route-Verify': 'true' })
    })

    it('sends no verification header on a capability that refuses it', async () => {
        fetchMock.mockResolvedValue(tregResponse({ output: { places: [{}] } }))

        await callTregCapability('google.serp.maps', { q: 'plumber Lyon' }, { workspaceId: 1, agentId: null })

        expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty('X-Treg-Route-Verify')
        expect(fetchMock.mock.calls[0][1].headers['X-Treg-Meta']).toBe('customer=ws_1')
    })

    it('caps the provider waterfall at three times the catalog price of the rows asked for', async () => {
        fetchMock.mockResolvedValue(tregResponse({ output: { people: [{}] } }))

        await callTregCapability('people.search', { q: 'head of marketing', limit: 10 }, { workspaceId: 1, agentId: null })
        await callTregCapability('people.search', { q: 'head of marketing', limit: 50 }, { workspaceId: 1, agentId: null })
        await callTregCapability('people.email.find', { full_name: 'Jane Doe', domain: 'acme.com' }, { workspaceId: 1, agentId: null })

        expect(fetchMock.mock.calls[0][1].headers['X-Treg-Route-Max-Cost']).toBe('0.3000')
        expect(fetchMock.mock.calls[1][1].headers['X-Treg-Route-Max-Cost']).toBe('1.5000')
        expect(fetchMock.mock.calls[2][1].headers).toMatchObject({ 'X-Treg-Route-Max-Cost': '0.0900', 'X-Treg-Route-Verify': 'true' })
    })

    it('reads the charge from the header and keeps the output and notes, not the raw answer', async () => {
        fetchMock.mockResolvedValue(tregResponse({ output: { email: 'jane@acme.com' }, raw: { huge: true }, _treg: { verification: { verdict: 'valid' }, advice: 'verify before sending' } }, { cost: '24500' }))

        const call = await callTregCapability('people.email.find', {}, { workspaceId: 1, agentId: null })

        expect(call).toEqual({ status: 200, outcome: 'ok', costMicros: 24_500, servedBy: 'hunter', callId: 'call_1', result: { output: { email: 'jane@acme.com' }, verification: { verdict: 'valid' }, advice: 'verify before sending', ignoredFilters: undefined }, full: null, error: null, errorCode: null })
    })

    it('hands the output back whole, however heavy', async () => {
        const videos = Array.from({ length: 30 }, (_, i) => ({ aweme_id: String(i), desc: 'd'.repeat(3_000), play_addr: { url_list: ['https://v16/p.mp4'] }, is_ad: false, share_count: 0 }))
        fetchMock.mockResolvedValue(tregResponse({ output: { videos, has_more: false } }))

        const call = await callTregCapability('tiktok.search.videos', { q: 'carousel' }, { workspaceId: 1, agentId: null })

        expect((call?.result as { output: object }).output).toEqual({ videos, has_more: false })
    })

    it('keeps the answer whole when asked, without what Treg paid for it', async () => {
        const output = { video: { aweme_id: '1', play_addr: { url_list: ['https://v16/p.mp4'] } } }
        fetchMock.mockResolvedValue(tregResponse({ output, raw: { aweme_detail: output.video }, _treg: { served_by: 'tikhub', charged_micro: 1_000, verification: { verdict: 'valid', cost_micro: 300 } } }))

        const call = await callTregCapability('tiktok.video.detail', { video_id: '1' }, { workspaceId: 1, agentId: null }, { full: true })

        expect(call?.full).toEqual({ output, raw: { aweme_detail: output.video }, notes: { servedBy: 'tikhub', verification: { verdict: 'valid' }, advice: undefined, ignoredFilters: undefined } })
        expect(call?.result).toMatchObject({ output: { video: { aweme_id: '1' } }, verification: { verdict: 'valid' } })
        expect(JSON.stringify(call)).not.toMatch(/cost_micro|charged_micro/)
    })

    it('drops what a provider billed from its raw answer, at any depth, and keeps a price, a payment option, a billing address', async () => {
        const place = { name: 'Café', price: '$$', 'Credit cards': true, accepts_credit_cards: true, billing_address: '1 rue X', cost_of_living: 'high' }
        const raw = { cost: 0.0032, credits: { jobCredits: 0.0015, remainingCredits: '99.8' }, chargeInfo: { creditsCharged: 2 }, quota: 10, charger: 'usb-c', rows: [{ ...place, credits_consumed: 1 }] }
        fetchMock.mockResolvedValue(tregResponse({ output: { places: [{ name: 'Café' }] }, raw }))

        const call = await callTregCapability('google.serp.maps', { q: 'café' }, { workspaceId: 1, agentId: null }, { full: true })

        expect(call?.full?.raw).toEqual({ charger: 'usb-c', rows: [place] })
    })

    it('tells a miss from a hit by the capability output field', async () => {
        fetchMock.mockResolvedValue(tregResponse({ output: { people: [] } }))

        const call = await callTregCapability('people.search', { company_domain: 'acme.com' }, { workspaceId: 1, agentId: null })

        expect(call?.outcome).toBe('miss')
    })

    it('reads the miss field of any capability from the catalog', async () => {
        fetchMock.mockResolvedValue(tregResponse({ output: { username: null } }))

        expect((await callTregCapability('tiktok.user.profile', { username: 'nobody' }, { workspaceId: 1, agentId: null }))?.outcome).toBe('miss')
    })

    it('shows the rows a search asked for and says how many more the provider sent, keeping them all in the full answer', async () => {
        const companies = Array.from({ length: 100 }, (_, i) => ({ domain: `firm${i}.com.br` }))
        fetchMock.mockResolvedValue(tregResponse({ output: { companies, count: 3578 }, _treg: { ignored_filters: ['country'] } }))

        const call = await callTregCapability('companies.search', { q: 'law firms', country: 'br', limit: 25 }, { workspaceId: 1, agentId: null }, { full: true })

        expect(call?.result).toEqual({ output: { companies: companies.slice(0, 25), count: 3578 }, ignoredFilters: ['country'], rows: { asked: 25, returned: 100, total: 3578 } })
        expect((call?.full?.output as { companies: unknown[] }).companies).toHaveLength(100)
    })

    it('hands every row back, with no row note, to a caller that does not take the full answer', async () => {
        const companies = Array.from({ length: 100 }, (_, i) => ({ domain: `firm${i}.com.br` }))
        fetchMock.mockResolvedValue(tregResponse({ output: { companies, count: 3578 } }))

        const call = await callTregCapability('companies.search', { q: 'law firms', country: 'br', limit: 25 }, { workspaceId: 1, agentId: null })

        expect((call?.result as { output: { companies: unknown[] } }).output.companies).toHaveLength(100)
        expect(call?.result).not.toHaveProperty('rows')
    })

    it('shows each Maps place by its prospecting fields and keeps every field in the full answer', async () => {
        const place = { position: 1, name: 'G’s Landscaping', category: 'Landscaper', categories: ['Landscaper', 'Contractor'], address: '8911 N Capital of Texas Hwy', phone: '+1 512-883-8127', website: 'https://glandscapingandmore.com/', rating: 4.7, review_count: 297, hours: { Monday: '7 AM–8 PM' }, latitude: 30.38, longitude: -97.75, cid: '654', place_id: 'ChIJ', url: 'https://www.google.com/maps/place/?q=place_id:ChIJ' }
        fetchMock.mockResolvedValue(tregResponse({ output: { places: [place] } }))

        const call = await callTregCapability('google.serp.maps', { q: 'landscaper Austin' }, { workspaceId: 1, agentId: null }, { full: true })

        expect(call?.result).toMatchObject({
            output: { places: [{ position: 1, name: 'G’s Landscaping', category: 'Landscaper', address: '8911 N Capital of Texas Hwy', phone: '+1 512-883-8127', website: 'https://glandscapingandmore.com/', rating: 4.7, review_count: 297 }] },
            omittedFields: ['categories', 'hours', 'latitude', 'longitude', 'cid', 'place_id', 'url'],
        })
        expect((call?.full?.output as { places: unknown[] }).places).toEqual([place])
    })

    it('shows every field of a Maps place to a caller that does not take the full answer', async () => {
        const place = { name: 'Café', hours: { Monday: '8 AM' }, place_id: 'ChIJ' }
        fetchMock.mockResolvedValue(tregResponse({ output: { places: [place] } }))

        const call = await callTregCapability('google.serp.maps', { q: 'café' }, { workspaceId: 1, agentId: null })

        expect(call?.result).toMatchObject({ output: { places: [place] } })
        expect(call?.result).not.toHaveProperty('omittedFields')
    })

    it('adds no row note when the provider kept to the limit', async () => {
        fetchMock.mockResolvedValue(tregResponse({ output: { people: [{ name: 'Jane' }] } }))

        const call = await callTregCapability('people.search', { q: 'cto', limit: 10 }, { workspaceId: 1, agentId: null })

        expect(call?.result).not.toHaveProperty('rows')
    })

    it('reports a 202 as pending', async () => {
        fetchMock.mockResolvedValue(tregResponse({ _treg: { outcome: 'pending' } }, { status: 202 }))

        const call = await callTregCapability('people.email.find', {}, { workspaceId: 1, agentId: null })

        expect(call?.outcome).toBe('pending')
    })

    it('carries the error Treg names', async () => {
        fetchMock.mockResolvedValue(tregResponse({ error: 'route_max_cost' }, { status: 402 }))

        const call = await callTregCapability('people.phone.find', {}, { workspaceId: 1, agentId: null })

        expect(call).toMatchObject({ status: 402, outcome: 'error', error: 'route_max_cost', errorCode: 'route_max_cost', costMicros: 0 })
    })

    it('reads an error Treg nests under detail, keeping its message for the coworker', async () => {
        fetchMock.mockResolvedValue(tregResponse({ detail: { error: 'route_caller_fault', message: 'tikhub rejected the request (400); not retried elsewhere' } }, { status: 400 }))

        const call = await callTregCapability('x.search.posts', { q: 'ai agents' }, { workspaceId: 1, agentId: null })

        expect(call).toMatchObject({ status: 400, outcome: 'error', error: 'tikhub rejected the request (400); not retried elsewhere', errorCode: 'route_caller_fault' })
    })

    it('reports an unreachable Treg without throwing', async () => {
        fetchMock.mockRejectedValue(new Error('ECONNRESET'))

        const call = await callTregCapability('people.phone.find', {}, { workspaceId: 1, agentId: null })

        expect(call).toMatchObject({ status: null, outcome: 'error', error: 'ECONNRESET' })
    })
})
