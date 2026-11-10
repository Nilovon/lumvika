// @vitest-environment happy-dom
import { Editor } from '@tiptap/core'
import { describe, expect, it } from 'vitest'

import type { BusinessCard } from '@/lib/company/explore/synthesize'
import { buildSeedPages } from '@/lib/brain/seed-pages'
import { brainExtensions, editorMarkdown } from './extensions'

function roundTrip(markdown: string): string {
    const editor = new Editor({ extensions: brainExtensions(), content: markdown })
    const out = editorMarkdown(editor)
    editor.destroy()
    return out
}

const wikilinks = (markdown: string) => [...markdown.matchAll(/\[\[[^\]\n]+\]\]/g)].map(m => m[0])

describe('brain page markdown', () => {
    it('keeps wikilinks as they were written', () => {
        const page = 'Sold to [[acme-corp]] and [[globex|Globex Inc]], see [[pricing#plans]].'
        expect(roundTrip(page)).toBe(page)
    })

    it('keeps a shared file link, with or without spaces in its path', () => {
        expect(roundTrip('Deck: [q3.pdf](shared:reports/q3.pdf)')).toBe('Deck: [q3.pdf](shared:reports/q3.pdf)')
        expect(roundTrip('Deck: [Q3 deck.pdf](<shared:reports/Q3 deck.pdf>)')).toBe('Deck: [Q3 deck.pdf](<shared:reports/Q3 deck.pdf>)')
    })

    it('keeps headings, lists, to-dos, quotes and code', () => {
        const page = [
            '# Title',
            '',
            '## Plans',
            '',
            '- Starter is **49** a month',
            '- Pro links [[offering]]',
            '',
            '1. First',
            '2. Second',
            '',
            '- [ ] Call [[acme-corp]]',
            '- [x] Send the deck',
            '',
            '> A quote',
            '',
            '```',
            'code [[not-a-link]]',
            '```',
            '',
            '---',
            '',
            'Visit [our site](https://example.com).',
        ].join('\n')
        expect(roundTrip(page)).toBe(page)
    })

    it('keeps the links of a page once it has been edited', () => {
        const editor = new Editor({ extensions: brainExtensions(), content: 'Sold to [[acme-corp]], deck in [q3.pdf](shared:reports/q3.pdf).' })
        editor.commands.focus('end')
        editor.commands.insertContent(' Renewed in [[q4-plan|Q4]].')
        const out = editorMarkdown(editor)
        editor.destroy()
        expect(out).toBe('Sold to [[acme-corp]], deck in [q3.pdf](shared:reports/q3.pdf). Renewed in [[q4-plan|Q4]].')
    })

    it('leaves brackets inside inline code alone', () => {
        expect(roundTrip('Type `[[slug]]` to link.')).toBe('Type `[[slug]]` to link.')
    })

    it('reads the seeded pages without losing a link, and settles after one pass', () => {
        const card = {
            company: { name: 'Acme', legalName: '', oneLiner: 'Coffee for offices.', description: 'We roast.', industry: 'Food', founded: '2019', headcount: '', headquarters: 'Lyon', siren: '' },
            person: { name: 'Marie', role: 'Founder', headline: '', location: '', linkedinUrl: '', background: '', photoUrl: null },
            offering: { products: ['Office Subscription'], pricing: 'From 49 EUR', businessModel: 'B2B' },
            market: { audience: 'Offices', idealCustomer: 'Tech', notableCustomers: ['Doctolib'], competitors: ['Nespresso Pro'] },
            presence: { channels: [], reputation: '' },
            stack: ['Shopify'],
            voice: { tone: 'Warm', language: 'French' },
            unknowns: [],
            branding: { logo: null, colors: [], fonts: [] },
        } as unknown as BusinessCard
        const pages = buildSeedPages({ card, brief: '', steward: null })
        expect(pages.length).toBeGreaterThan(0)
        for (const page of pages) {
            const once = roundTrip(page.content)
            expect(wikilinks(once)).toEqual(wikilinks(page.content))
            expect(roundTrip(once)).toBe(once)
        }
    })
})
