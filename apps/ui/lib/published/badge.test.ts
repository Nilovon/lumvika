import { describe, expect, it } from 'vitest'
import { injectBadge } from './badge'

describe('injectBadge', () => {
    it('goes right before the last closing body tag', () => {
        const html = '<html><body><p>hi</p></BODY></html>'
        const out = injectBadge(html, 'demo')
        expect(out.startsWith('<html><body><p>hi</p><script>')).toBe(true)
        expect(out.endsWith('</script></BODY></html>')).toBe(true)
    })

    it('is appended to a page with no body tag', () => {
        const out = injectBadge('<p>hi</p>', 'demo')
        expect(out.startsWith('<p>hi</p><script>')).toBe(true)
    })

    it('links to the landing with the slug as attribution', () => {
        expect(injectBadge('', 'demo')).toContain('utm_content=demo')
    })
})
