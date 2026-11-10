import { describe, expect, it } from 'vitest'
import { normalizeDomain } from './brand-icon'

describe('normalizeDomain', () => {
    it('reduces a URL, a host or a domain to the host without www', () => {
        expect(normalizeDomain('https://stripe.com/pricing')).toBe('stripe.com')
        expect(normalizeDomain(' WWW.Stripe.com ')).toBe('stripe.com')
        expect(normalizeDomain('HTTP://www.notion.so/x')).toBe('notion.so')
        expect(normalizeDomain('api.github.com:443/v3')).toBe('api.github.com')
    })

    it('falls back to the text before the first slash when it is not a valid URL', () => {
        expect(normalizeDomain('exa mple.com/path')).toBe('exa mple.com')
    })
})
