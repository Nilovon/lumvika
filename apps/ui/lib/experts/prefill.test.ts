import { describe, expect, it } from 'vitest'

import { pickProfileUrl, prefillPatch, type ExpertPrefillRow } from './prefill'
import type { EnrichedExpert } from './enrich'

function row(fields: Partial<ExpertPrefillRow> = {}): ExpertPrefillRow {
    return {
        id: 'e1',
        slug: 'jane-doe',
        avatar_url: null,
        location: null,
        timezone: null,
        bio: null,
        budget: null,
        skills: [],
        languages: [],
        x_url: null,
        linkedin_url: null,
        github_url: null,
        website_url: null,
        ...fields,
    }
}

function enriched(fields: Partial<EnrichedExpert> = {}): EnrichedExpert {
    return {
        name: 'Jane Doe',
        type: 'freelancer',
        email: 'jane@doe.com',
        location: 'Paris, France',
        timezone: 'Europe/Paris',
        bio: 'I build agents.',
        budget: null,
        skills: [],
        languages: [],
        x_url: '',
        linkedin_url: '',
        github_url: '',
        website_url: '',
        ...fields,
    }
}

describe('pickProfileUrl', () => {
    it('prefers linkedin over x', () => {
        expect(pickProfileUrl({ linkedin_url: 'https://www.linkedin.com/in/jane-doe', x_url: 'https://x.com/jane' })).toEqual({
            url: 'https://www.linkedin.com/in/jane-doe',
            source: 'linkedin',
        })
    })

    it('falls back to x when linkedin is missing', () => {
        expect(pickProfileUrl({ linkedin_url: null, x_url: 'https://x.com/jane' })).toEqual({ url: 'https://x.com/jane', source: 'x' })
    })

    it('falls back to x when the linkedin field holds something else', () => {
        expect(pickProfileUrl({ linkedin_url: 'https://jane.dev', x_url: 'https://twitter.com/jane' })).toEqual({
            url: 'https://twitter.com/jane',
            source: 'x',
        })
    })

    it('returns null without a recognised profile', () => {
        expect(pickProfileUrl({ linkedin_url: null, x_url: null })).toBe(null)
        expect(pickProfileUrl({ linkedin_url: '   ', x_url: 'https://jane.dev' })).toBe(null)
    })
})

describe('prefillPatch', () => {
    const url = 'https://www.linkedin.com/in/jane-doe'

    it('fills every blank column', () => {
        const patch = prefillPatch(
            row({ linkedin_url: url }),
            enriched({ skills: ['Agent Design'], languages: ['English'], budget: '$1,000 – $5,000', github_url: 'https://github.com/jane' }),
            'linkedin',
            url,
            'https://cdn.lumvika/avatar.webp',
        )

        expect(patch).toMatchObject({
            location: 'Paris, France',
            timezone: 'Europe/Paris',
            bio: 'I build agents.',
            budget: '$1,000 – $5,000',
            avatar_url: 'https://cdn.lumvika/avatar.webp',
            github_url: 'https://github.com/jane',
            skills: ['Agent Design'],
            languages: ['English'],
        })
    })

    it('never overwrites what the applicant typed', () => {
        const patch = prefillPatch(
            row({ linkedin_url: url, location: 'Lyon', bio: 'My own words.', website_url: 'https://jane.studio', skills: ['MCP Servers'], languages: ['French'] }),
            enriched({ location: 'Paris, France', bio: 'I build agents.', website_url: 'https://scraped.example', skills: ['Agent Design'], languages: ['English'] }),
            'linkedin',
            url,
            null,
        )

        expect(patch.location).toBeUndefined()
        expect(patch.bio).toBeUndefined()
        expect(patch.website_url).toBeUndefined()
        expect(patch.skills).toBeUndefined()
        expect(patch.languages).toBeUndefined()
    })

    it('fills the other network from the scraped profile', () => {
        const patch = prefillPatch(row({ linkedin_url: url }), enriched({ x_url: 'https://x.com/jane' }), 'linkedin', url, null)
        expect(patch.x_url).toBe('https://x.com/jane')
        expect(patch.linkedin_url).toBeUndefined()

        const fromX = prefillPatch(
            row({ x_url: 'https://twitter.com/jane' }),
            enriched({ linkedin_url: 'https://www.linkedin.com/in/jane-doe' }),
            'x',
            'https://twitter.com/jane',
            null,
        )
        expect(fromX.linkedin_url).toBe('https://www.linkedin.com/in/jane-doe')
        expect(fromX.x_url).toBeUndefined()
    })

    it('drops a timezone the runtime does not know', () => {
        const patch = prefillPatch(row({ linkedin_url: url }), enriched({ timezone: 'Middle/Earth' }), 'linkedin', url, null)
        expect(patch.timezone).toBeUndefined()
    })

    it('is empty when the model returns nothing usable, so the row is left untouched', () => {
        const patch = prefillPatch(row({ linkedin_url: url }), enriched({ location: '', bio: '', timezone: '' }), 'linkedin', url, null)
        expect(patch).toEqual({})
    })
})
