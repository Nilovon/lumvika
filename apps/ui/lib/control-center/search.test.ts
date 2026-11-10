import { describe, expect, it } from 'vitest'

import { matchRank, parseQuery, searchItems } from './search'

describe('parseQuery', () => {
    it('reads a plain query as a search across everything', () => {
        expect(parseQuery('  Billing ')).toEqual({ scope: 'all', text: 'billing' })
    })

    it('narrows to agents on @ and to commands on /', () => {
        expect(parseQuery('@ Ada')).toEqual({ scope: 'agents', text: 'ada' })
        expect(parseQuery('/theme')).toEqual({ scope: 'commands', text: 'theme' })
    })

    it('keeps the scope when only the prefix is typed', () => {
        expect(parseQuery('@')).toEqual({ scope: 'agents', text: '' })
    })
})

describe('matchRank', () => {
    it('ranks a label prefix above a word start, above a substring', () => {
        const prefix = matchRank({ label: 'Billing' }, 'bil')
        const word = matchRank({ label: 'Open billing' }, 'bil')
        const inside = matchRank({ label: 'Rebilling' }, 'bil')
        expect(prefix).not.toBeNull()
        expect(prefix!).toBeLessThan(word!)
        expect(word!).toBeLessThan(inside!)
    })

    it('ranks any label hit above a keyword hit', () => {
        const label = matchRank({ label: 'Reinvite' }, 'invite')
        const keyword = matchRank({ label: 'Members', keywords: ['invite'] }, 'invite')
        expect(label!).toBeLessThan(keyword!)
    })

    it('says no match with null', () => {
        expect(matchRank({ label: 'Members', keywords: ['team'] }, 'zzz')).toBeNull()
    })
})

describe('searchItems', () => {
    const items = [{ label: 'Members', keywords: ['invite', 'team'] }, { label: 'Invoice agent' }, { label: 'Billing', keywords: ['invoices'] }]

    it('keeps the given order when nothing is typed', () => {
        expect(searchItems(items, '').map(item => item.label)).toEqual(['Members', 'Invoice agent', 'Billing'])
    })

    it('orders by rank, then by the original order', () => {
        expect(searchItems(items, 'inv').map(item => item.label)).toEqual(['Invoice agent', 'Members', 'Billing'])
    })

    it('caps the result', () => {
        expect(searchItems(items, 'inv', 1)).toHaveLength(1)
    })
})
