import { describe, expect, it } from 'vitest'
import { chunkPage, MAX_CHUNK_CHARS, MIN_CHUNK_CHARS } from './chunks.js'
import { parseLinks } from './links.js'

const para = (word: string, chars: number) => `${word} `.repeat(Math.ceil(chars / (word.length + 1))).trim()

describe('chunkPage', () => {
    it('cuts on ## and ### headings and names the text before the first one Overview', () => {
        const content = [para('intro', 300), '## Pricing', para('price', 300), '### Discounts', para('discount', 300)].join('\n')
        const chunks = chunkPage({ title: 'Offering', type: 'offering', content })
        expect(chunks.map(c => c.heading)).toEqual(['Overview', 'Pricing', 'Discounts'])
        expect(chunks.map(c => c.ordinal)).toEqual([0, 1, 2])
    })

    it('prefixes the embedded text with the page title, type and heading', () => {
        const [chunk] = chunkPage({ title: 'Offering', type: 'offering', content: `## Pricing\n${para('price', 300)}` })
        expect(chunk.text.startsWith('Offering (offering) > Pricing\n\n')).toBe(true)
        expect(chunk.content.startsWith('price')).toBe(true)
        expect(chunk.textHash).toMatch(/^[0-9a-f]{32}$/)
    })

    it('folds a short section into the next one under both headings', () => {
        const content = ['## Plans', 'Two plans.', '## Pricing', para('price', 300)].join('\n')
        const chunks = chunkPage({ title: 'Offering', type: 'offering', content })
        expect(chunks).toHaveLength(1)
        expect(chunks[0].heading).toBe('Plans / Pricing')
        expect(chunks[0].content).toContain('Two plans.')
    })

    it('folds a short last section into the one before it', () => {
        const content = ['## Pricing', para('price', 300), '## Contact', 'Write to us.'].join('\n')
        const chunks = chunkPage({ title: 'Offering', type: 'offering', content })
        expect(chunks.map(c => c.heading)).toEqual(['Pricing / Contact'])
    })

    it('keeps a page made of one short section', () => {
        const chunks = chunkPage({ title: 'Voice', type: 'voice', content: 'Friendly, direct.' })
        expect(chunks).toHaveLength(1)
        expect(chunks[0].content.length).toBeLessThan(MIN_CHUNK_CHARS)
    })

    it('splits a long section by paragraphs, then a single huge paragraph on its own', () => {
        const paragraphs = Array.from({ length: 6 }, (_, i) => para(`p${i}`, 500)).join('\n\n')
        const huge = 'x'.repeat(MAX_CHUNK_CHARS * 2 + 10)
        const chunks = chunkPage({ title: 'Team', type: 'team', content: `## People\n${paragraphs}\n\n${huge}` })
        expect(chunks.length).toBeGreaterThan(3)
        for (const chunk of chunks) expect(chunk.content.length).toBeLessThanOrEqual(MAX_CHUNK_CHARS)
        expect(chunks.every(c => c.heading === 'People')).toBe(true)
    })

    it('returns nothing for an empty page', () => {
        expect(chunkPage({ title: 'Empty', type: 'note', content: '   ' })).toEqual([])
    })
})

describe('parseLinks', () => {
    it('reads plain, labelled and heading links, deduplicated and without the page itself', () => {
        const content = 'See [[acme-corp]], [[Pricing|our prices]], [[team#founders]], [[acme-corp]] and [[offering]].'
        expect(parseLinks(content, 'offering')).toEqual(['acme-corp', 'pricing', 'team'])
    })

    it('ignores bracketed prose that is not a slug', () => {
        expect(parseLinks('[[not a slug]] [[ok-one]]')).toEqual(['ok-one'])
    })
})
