import { describe, expect, it } from 'vitest'
import { humanizeTableName } from './table-name'

describe('humanizeTableName', () => {
    it('turns a code-style name into words', () => {
        expect(humanizeTableName('leads_queue')).toBe('Leads queue')
        expect(humanizeTableName('openDeals')).toBe('Open deals')
        expect(humanizeTableName('content-calendar_2026')).toBe('Content calendar 2026')
        expect(humanizeTableName('catalog')).toBe('Catalog')
    })

    it('keeps a name that has nothing to read', () => {
        expect(humanizeTableName('__')).toBe('__')
    })
})
