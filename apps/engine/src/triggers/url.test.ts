import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { vi } from 'vitest'

process.env.LUMVIKA_DATA_DIR = mkdtempSync(resolve(tmpdir(), 'lumvika-trigger-url-'))
process.env.LUMVIKA_API_KEY = ''

const hub = vi.hoisted(() => ({ answer: undefined as unknown, fail: false, calls: [] as unknown[][] }))

vi.mock('../runtime/hub.js', () => ({
    callHub: async (...args: unknown[]) => {
        hub.calls.push(args)
        if (hub.fail) throw new Error('hub down')
        return hub.answer
    },
}))

const { beforeEach, describe, expect, it } = await import('vitest')
const { triggerPublicUrl, urlLine } = await import('./url.js')

const trigger = { slug: 'stripe-refund', token: 'tok-secret' } as any

beforeEach(() => {
    hub.answer = undefined
    hub.fail = false
    hub.calls = []
})

describe('triggerPublicUrl', () => {
    it('asks the hub for the URL of this slug and token', async () => {
        hub.answer = { url: 'https://lumvika.com/hooks/abc' }
        expect(await triggerPublicUrl('agent1', trigger)).toBe('https://lumvika.com/hooks/abc')
        expect(hub.calls).toEqual([[{ id: 'agent1' }, 'trigger_url', { slug: 'stripe-refund', token: 'tok-secret' }]])
    })

    it('answers null when the hub gives no string URL', async () => {
        for (const answer of [{ url: 42 }, {}, null, 'https://not-an-object']) {
            hub.answer = answer
            expect(await triggerPublicUrl('agent1', trigger)).toBeNull()
        }
    })

    it('answers null when the hub cannot be reached', async () => {
        hub.fail = true
        expect(await triggerPublicUrl('agent1', trigger)).toBeNull()
    })

    it('answers null without asking the hub when the trigger has no token', async () => {
        hub.answer = { url: 'https://lumvika.com/hooks/abc' }
        expect(await triggerPublicUrl('agent1', { ...trigger, token: '' })).toBeNull()
        expect(hub.calls).toEqual([])
    })
})

describe('urlLine', () => {
    it('states the URL when there is one', () => {
        expect(urlLine('https://lumvika.com/hooks/abc')).toBe('Its public URL is https://lumvika.com/hooks/abc')
    })

    it('points at the Triggers tab otherwise', () => {
        expect(urlLine(null)).toContain("open the coworker's Triggers tab")
        expect(urlLine('')).toContain("open the coworker's Triggers tab")
    })
})
