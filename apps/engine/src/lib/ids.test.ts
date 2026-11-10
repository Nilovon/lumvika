import { describe, expect, it } from 'vitest'
import { slugify } from './ids.js'

describe('slugify', () => {
    it('transliterates accented letters instead of dropping them to a separator', () => {
        expect(slugify('Changelog Clém — récap + angles d\'annonce')).toBe('changelog-clem-recap-angles-d-annonce')
        expect(slugify('Veille SEO — été')).toBe('veille-seo-ete')
        expect(slugify('Résumé quotidien')).toBe('resume-quotidien')
    })

    it('leaves plain ascii names untouched', () => {
        expect(slugify('weekly seo audit')).toBe('weekly-seo-audit')
    })

    it('trims separators and caps the length', () => {
        expect(slugify('  !! hello !!  ')).toBe('hello')
        expect(slugify('a'.repeat(80))).toHaveLength(64)
    })
})
