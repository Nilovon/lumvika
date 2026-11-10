process.env.LUMVIKA_API_KEY = 'engine-secret'
process.env.LUMVIKA_HUB_BASE_URL = 'https://hub.example.test/'

const { afterEach, beforeEach, describe, expect, it, vi } = await import('vitest')
const { forgetPriceMultiplier, hubPriceMultiplier, paidDataOffered, paidDataOfferedSoFar } = await import('./price.js')
const { setEnv } = await import('../config/env.js')

const originalFetch = globalThis.fetch

function hubAnswers(status: number, body: unknown) {
    const fn = vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }))
    globalThis.fetch = fn as unknown as typeof fetch
    return fn
}

beforeEach(() => forgetPriceMultiplier())
afterEach(() => {
    globalThis.fetch = originalFetch
    setEnv({ LUMVIKA_API_KEY: 'engine-secret', LUMVIKA_HUB_BASE_URL: 'https://hub.example.test/' })
})

describe('the paid data terms of the hub', () => {
    it('offers paid data at the multiplier of a hub that sells it', async () => {
        hubAnswers(200, { priceMultiplier: 1.5, enabled: true })
        expect(await paidDataOffered()).toBe(true)
        expect(await hubPriceMultiplier()).toBe(1.5)
        expect(paidDataOfferedSoFar()).toBe(true)
    })

    it('offers none when the hub sells none, as a self-hosted hub does', async () => {
        hubAnswers(200, { priceMultiplier: 1, enabled: false })
        expect(await paidDataOffered()).toBe(false)
        expect(paidDataOfferedSoFar()).toBe(false)
    })

    it('keeps paid data on, without a price, against a hub older than the question', async () => {
        hubAnswers(405, {})
        expect(await paidDataOffered()).toBe(true)
        expect(await hubPriceMultiplier()).toBeNull()
    })

    it('offers none on an engine that is not linked to a hub, and asks nothing', async () => {
        setEnv({ LUMVIKA_API_KEY: '', LUMVIKA_HUB_BASE_URL: '' })
        const fetchMock = hubAnswers(200, { priceMultiplier: 1.5, enabled: true })
        expect(await paidDataOffered()).toBe(false)
        expect(paidDataOfferedSoFar()).toBe(false)
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('asks the hub once for concurrent readers and once per five minutes', async () => {
        const fetchMock = hubAnswers(200, { priceMultiplier: 2, enabled: true })
        await Promise.all([paidDataOffered(), hubPriceMultiplier(), paidDataOffered()])
        await hubPriceMultiplier()
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })
})
