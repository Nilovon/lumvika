import { describe, expect, it } from 'vitest'
import { readFirstName } from './first-name'

describe('readFirstName', () => {
    it('reads our own sign-up key, then the Google one', () => {
        expect(readFirstName({ first_name: ' Jane ', given_name: 'Other' })).toBe('Jane')
        expect(readFirstName({ first_name: '  ', given_name: 'Jean' })).toBe('Jean')
    })

    it('falls back to the front of a full name', () => {
        expect(readFirstName({ full_name: '  Jean   Dupont ' })).toBe('Jean')
        expect(readFirstName({ name: 'Ana Lima' })).toBe('Ana')
    })

    it('ignores values that are not strings and has nothing without metadata', () => {
        expect(readFirstName({ first_name: 42, full_name: ['x'] })).toBe('')
        expect(readFirstName(undefined)).toBe('')
    })
})
