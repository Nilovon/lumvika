import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PAID_DATA_FULL_ANSWER_HEADER } from '@rerun/contracts'
import { notifyBudgetExhausted } from '@/ee/services/budgetNotification.service'
import { getWorkspaceBudgetByEngineKey, hasRemainingBudget, recordPaidDataUsage } from '@/ee/services/rerunBudget.service'
import { callTregCapability, type TregCall } from '@/lib/paid-data/treg'
import { GET, POST } from './route'

vi.mock('next/server', () => ({ after: (fn: () => void) => fn() }))
vi.mock('@/ee/services/budgetNotification.service', () => ({ notifyBudgetExhausted: vi.fn() }))
vi.mock('@/ee/services/rerunBudget.service', () => ({
    ensureCurrentPeriod: vi.fn(async (b: unknown) => b),
    getWorkspaceBudgetByEngineKey: vi.fn(),
    hasRemainingBudget: vi.fn(() => true),
    recordPaidDataUsage: vi.fn(),
    RERUN_CREDIT_PAUSED_ERROR: 'rerun_credit_paused',
}))
vi.mock('@/lib/paid-data/treg', () => ({ callTregCapability: vi.fn() }))
vi.mock('@rerun/cloud/billing', () => ({ get BILLING_ENABLED() { return billing.enabled } }))

const billing = vi.hoisted(() => ({ enabled: true }))

const WORKSPACE_ID = 7
const originalMultiplier = process.env.PAID_DATA_PRICE_MULTIPLIER

const FOUND: TregCall = { status: 200, outcome: 'ok', costMicros: 20_000, servedBy: 'hunter', callId: 'call_1', result: { output: { email: 'jane@acme.com' } }, full: null, error: null, errorCode: null }

function paidRequest({ token = 'engine-key', body = { capability: 'people.email.find', params: { full_name: 'Jane Doe', domain: 'acme.com' } }, extraHeaders = {} }: { token?: string | null; body?: unknown; extraHeaders?: Record<string, string> } = {}) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'x-rerun-agent': 'prospector', ...extraHeaders }
    if (token !== null) headers.authorization = `Bearer ${token}`
    return new Request('https://hub.test/api/paid-data', { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) })
}

describe('POST /api/paid-data', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.spyOn(console, 'error').mockImplementation(() => undefined)
        delete process.env.PAID_DATA_PRICE_MULTIPLIER
        vi.mocked(getWorkspaceBudgetByEngineKey).mockImplementation(async token => (token === 'engine-key' ? ({ workspaceId: WORKSPACE_ID } as Awaited<ReturnType<typeof getWorkspaceBudgetByEngineKey>>) : null))
        vi.mocked(hasRemainingBudget).mockReturnValue(true)
        vi.mocked(callTregCapability).mockResolvedValue(FOUND)
        vi.mocked(recordPaidDataUsage).mockResolvedValue(undefined)
    })

    afterEach(() => {
        if (originalMultiplier === undefined) delete process.env.PAID_DATA_PRICE_MULTIPLIER
        else process.env.PAID_DATA_PRICE_MULTIPLIER = originalMultiplier
    })

    it('refuses a request without an engine key, or with one that names no workspace', async () => {
        expect((await POST(paidRequest({ token: null }))).status).toBe(401)
        expect((await POST(paidRequest({ token: 'stolen' }))).status).toBe(401)
        expect(callTregCapability).not.toHaveBeenCalled()
    })

    it('refuses an unknown capability and parameters its schema rejects', async () => {
        expect((await POST(paidRequest({ body: 'not json' }))).status).toBe(400)
        expect((await POST(paidRequest({ body: { capability: 'treg.anything', params: {} } }))).status).toBe(400)
        expect((await POST(paidRequest({ body: { tool: 'treg.anything', params: {} } }))).status).toBe(400)
        expect((await POST(paidRequest({ body: { capability: 'people.email.verify', params: { email: 'not-an-email' } } }))).status).toBe(400)
        const missingIdentity = await POST(paidRequest({ body: { capability: 'linkedin.user.profile', params: {} } }))
        expect(missingIdentity.status).toBe(400)
        expect(await missingIdentity.json()).toEqual({ error: 'linkedin.user.profile needs one of: linkedin_url, linkedin_handle.' })
        expect(callTregCapability).not.toHaveBeenCalled()
    })

    it('answers 402 and calls nothing once the workspace credit is spent', async () => {
        vi.mocked(hasRemainingBudget).mockReturnValue(false)

        const response = await POST(paidRequest())

        expect(response.status).toBe(402)
        expect(await response.json()).toEqual({ error: 'rerun_budget_exhausted' })
        expect(notifyBudgetExhausted).toHaveBeenCalledWith(WORKSPACE_ID)
        expect(callTregCapability).not.toHaveBeenCalled()
    })

    it('answers 402 and calls nothing while the workspace credit is paused, without the used-up notice', async () => {
        vi.mocked(getWorkspaceBudgetByEngineKey).mockResolvedValue({ workspaceId: WORKSPACE_ID, paused: true } as Awaited<ReturnType<typeof getWorkspaceBudgetByEngineKey>>)

        const response = await POST(paidRequest())

        expect(response.status).toBe(402)
        expect(await response.json()).toEqual({ error: 'rerun_credit_paused' })
        expect(notifyBudgetExhausted).not.toHaveBeenCalled()
        expect(callTregCapability).not.toHaveBeenCalled()
    })

    it('answers 503 when no Treg token is configured', async () => {
        vi.mocked(callTregCapability).mockResolvedValue(null)

        expect((await POST(paidRequest())).status).toBe(503)
        expect(recordPaidDataUsage).not.toHaveBeenCalled()
    })

    it('calls the routed capability with the workspace and agent tags', async () => {
        await POST(paidRequest())

        expect(callTregCapability).toHaveBeenCalledWith('people.email.find', { full_name: 'Jane Doe', domain: 'acme.com' }, { workspaceId: WORKSPACE_ID, agentId: 'prospector' }, { full: false })
    })

    it('still serves an engine that names the tool it shipped with', async () => {
        const response = await POST(paidRequest({ body: { tool: 'google_maps_search', params: { q: 'plumber Lyon', country: 'fr' } } }))

        expect(response.status).toBe(200)
        expect(callTregCapability).toHaveBeenCalledWith('google.serp.maps', { q: 'plumber Lyon', country: 'fr' }, { workspaceId: WORKSPACE_ID, agentId: 'prospector' }, { full: false })
    })

    it('bills what Treg charged when no multiplier is set', async () => {
        const response = await POST(paidRequest())

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ outcome: 'ok', result: FOUND.result, costMicros: 20_000, servedBy: 'hunter' })
        expect(recordPaidDataUsage).toHaveBeenCalledWith(expect.objectContaining({ provider_cost_micros: 20_000, billed_micros: 20_000 }))
    })

    it('bills what Treg charged times the multiplier of the environment', async () => {
        process.env.PAID_DATA_PRICE_MULTIPLIER = '1.5'

        const response = await POST(paidRequest())

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ outcome: 'ok', result: FOUND.result, costMicros: 30_000, servedBy: 'hunter' })
        expect(recordPaidDataUsage).toHaveBeenCalledWith(expect.objectContaining({ workspace_id: WORKSPACE_ID, engine_agent_id: 'prospector', tool: 'paid_data', capability: 'treg.people.email.find', served_by: 'hunter', outcome: 'ok', provider_cost_micros: 20_000, billed_micros: 30_000, treg_status: 200, treg_call_id: 'call_1' }))
    })

    it('adds the whole answer and its call id for an engine that saves it', async () => {
        const full = { output: { email: 'jane@acme.com' }, raw: { person: { email: 'jane@acme.com', seniority: 'c_suite' } }, notes: { servedBy: 'hunter' } }
        vi.mocked(callTregCapability).mockResolvedValue({ ...FOUND, full })

        const response = await POST(paidRequest({ extraHeaders: { [PAID_DATA_FULL_ANSWER_HEADER]: '1' } }))

        expect(callTregCapability).toHaveBeenCalledWith('people.email.find', expect.anything(), expect.anything(), { full: true })
        expect(await response.json()).toEqual({ outcome: 'ok', result: FOUND.result, costMicros: 20_000, servedBy: 'hunter', callId: 'call_1', full })
    })

    it("leaves out a provider's raw body too heavy to save", async () => {
        vi.mocked(callTregCapability).mockResolvedValue({ ...FOUND, full: { output: { email: 'jane@acme.com' }, raw: { blob: 'x'.repeat(15_000_001) }, notes: {} } })

        const response = await POST(paidRequest({ extraHeaders: { [PAID_DATA_FULL_ANSWER_HEADER]: '1' } }))

        expect((await response.json()).full).toEqual({ output: { email: 'jane@acme.com' }, raw: null, notes: {}, rawDropped: true })
    })

    it('reads the multiplier from the environment', async () => {
        process.env.PAID_DATA_PRICE_MULTIPLIER = '2'

        const response = await POST(paidRequest())

        expect((await response.json()).costMicros).toBe(40_000)
    })

    it('bills nothing for a miss Treg did not charge', async () => {
        vi.mocked(callTregCapability).mockResolvedValue({ ...FOUND, outcome: 'miss', costMicros: 0, result: { output: { email: null } } })

        const response = await POST(paidRequest())

        expect(await response.json()).toMatchObject({ outcome: 'miss', costMicros: 0 })
        expect(recordPaidDataUsage).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'miss', billed_micros: 0 }))
    })

    it('hands a provider error back to the coworker unbilled', async () => {
        vi.mocked(callTregCapability).mockResolvedValue({ status: 422, outcome: 'error', costMicros: 0, servedBy: null, callId: 'call_2', result: null, full: null, error: 'no identity key', errorCode: null })

        const response = await POST(paidRequest())

        expect(response.status).toBe(422)
        expect(await response.json()).toEqual({ error: 'no identity key', costMicros: 0 })
    })

    it.each([
        [503, 'database pool saturated'],
        [429, 'rate limited'],
        [500, 'internal error'],
        [null, 'The operation was aborted due to timeout'],
    ])('answers 503 unbilled when Treg answers %s, so the engine reads the source as down', async (status, error) => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        vi.mocked(callTregCapability).mockResolvedValue({ status, outcome: 'error', costMicros: 0, servedBy: null, callId: 'call_4', result: null, full: null, error, errorCode: null })

        const response = await POST(paidRequest())

        expect(response.status).toBe(503)
        expect(await response.json()).toEqual({ error: 'Paid data is temporarily unavailable', costMicros: 0 })
        expect(recordPaidDataUsage).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'error', billed_micros: 0, treg_status: status }))
        expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('unavailable'), status ?? 'unreachable', 'call_4', error)
    })

    it('keeps a billed provider failure as a failure with its cost, never as an unbilled outage', async () => {
        vi.mocked(callTregCapability).mockResolvedValue({ status: 502, outcome: 'error', costMicros: 10_000, servedBy: null, callId: 'call_5', result: null, full: null, error: 'upstream broke', errorCode: null })

        const response = await POST(paidRequest())

        expect(response.status).toBe(502)
        expect(await response.json()).toEqual({ error: 'upstream broke', costMicros: 10_000 })
    })

    it('tells the coworker in plain words when the waterfall stopped at the catalog ceiling, unbilled', async () => {
        vi.mocked(callTregCapability).mockResolvedValue({ status: 402, outcome: 'error', costMicros: 0, servedBy: null, callId: 'call_3', result: null, full: null, error: 'route_max_cost', errorCode: 'route_max_cost' })

        const response = await POST(paidRequest())

        expect(response.status).toBe(422)
        const body = await response.json()
        expect(body.costMicros).toBe(0)
        expect(body.error).toContain('no source answered this at the catalog price')
        expect(body.error).toContain('Do not retry the same lookup')
        expect(recordPaidDataUsage).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'error', billed_micros: 0 }))
        expect(console.error).not.toHaveBeenCalledWith(expect.stringContaining('Treg balance is exhausted'))
    })

    it('answers 503 and logs when our own Treg balance is exhausted', async () => {
        vi.mocked(callTregCapability).mockResolvedValue({ status: 402, outcome: 'error', costMicros: 0, servedBy: null, callId: null, result: null, full: null, error: 'Your balance is too low', errorCode: 'insufficient_balance' })

        const response = await POST(paidRequest())

        expect(response.status).toBe(503)
        expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Treg balance is exhausted'))
    })

    it('still answers when the bookkeeping fails', async () => {
        vi.mocked(recordPaidDataUsage).mockRejectedValue(new Error('db down'))

        const response = await POST(paidRequest())

        expect(response.status).toBe(200)
    })
})

describe('GET /api/paid-data', () => {
    const priceRequest = (token: string | null) => new Request('https://hub.test/api/paid-data', { headers: token === null ? {} : { authorization: `Bearer ${token}` } })

    beforeEach(() => {
        vi.mocked(getWorkspaceBudgetByEngineKey).mockImplementation(async token => (token === 'engine-key' ? ({ workspaceId: WORKSPACE_ID } as Awaited<ReturnType<typeof getWorkspaceBudgetByEngineKey>>) : null))
    })

    afterEach(() => {
        if (originalMultiplier === undefined) delete process.env.PAID_DATA_PRICE_MULTIPLIER
        else process.env.PAID_DATA_PRICE_MULTIPLIER = originalMultiplier
    })

    it('refuses a request without an engine key, or with one that names no workspace', async () => {
        expect((await GET(priceRequest(null))).status).toBe(401)
        expect((await GET(priceRequest('stolen'))).status).toBe(401)
    })

    it.each([
        [undefined, 1],
        ['1.5', 1.5],
        ['2', 2],
        ['not a number', 1],
    ])('gives the engine the multiplier POST bills with (env %s)', async (env, expected) => {
        if (env === undefined) delete process.env.PAID_DATA_PRICE_MULTIPLIER
        else process.env.PAID_DATA_PRICE_MULTIPLIER = env

        const response = await GET(priceRequest('engine-key'))

        expect(await response.json()).toEqual({ enabled: true, priceMultiplier: expected })
    })

    it('tells the engine that a hub selling no plan sells no paid data either', async () => {
        billing.enabled = false
        try {
            expect(await (await GET(priceRequest('engine-key'))).json()).toMatchObject({ enabled: false })
        } finally {
            billing.enabled = true
        }
    })
})
