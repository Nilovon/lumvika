import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { decideIndustry } from './decide-industry'

const answer = (choice: unknown, confidence: unknown) => ({ answers: { industry: { type: 'choice', choice, confidence } } })

const respond = (body: unknown, ok = true) => vi.fn().mockResolvedValue({ ok, json: async () => body })

describe('decideIndustry', () => {
    beforeEach(() => {
        vi.stubEnv('OPENROUTER_API_KEY', 'sk-or-test')
    })

    afterEach(() => {
        vi.unstubAllEnvs()
        vi.unstubAllGlobals()
    })

    it('takes a confident choice', async () => {
        vi.stubGlobal('fetch', respond(answer('saas', 0.97)))
        expect(await decideIndustry('https://rerun.build')).toEqual({ industry: 'saas', confidence: 0.97 })
    })

    it('falls back on other when the model is unsure, keeping what it was sure of', async () => {
        vi.stubGlobal('fetch', respond(answer('agencies', 0.31)))
        expect(await decideIndustry('https://qzbtlm-ventures.io')).toEqual({ industry: 'other', confidence: 0.31 })
    })

    it('refuses a choice outside the taxonomy rather than storing it', async () => {
        vi.stubGlobal('fetch', respond(answer('bakery', 1)))
        expect(await decideIndustry('https://example.com')).toBeNull()
    })

    it('gives up on a malformed body, a refusal and a timeout', async () => {
        vi.stubGlobal('fetch', respond({ answers: {} }))
        expect(await decideIndustry('https://example.com')).toBeNull()

        vi.stubGlobal('fetch', respond(answer('saas', 1), false))
        expect(await decideIndustry('https://example.com')).toBeNull()

        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('TimeoutError')))
        expect(await decideIndustry('https://example.com')).toBeNull()
    })

    it('does not call out at all without a key or without an input', async () => {
        const fetcher = respond(answer('saas', 1))
        vi.stubGlobal('fetch', fetcher)
        expect(await decideIndustry('   ')).toBeNull()

        vi.stubEnv('OPENROUTER_API_KEY', '')
        expect(await decideIndustry('https://rerun.build')).toBeNull()
        expect(fetcher).not.toHaveBeenCalled()
    })
})
