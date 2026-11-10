import { describe, expect, it } from 'vitest'

import { accountLabel, deletedAccountEmailFor, isDeletedAccountEmail, isPlaceholderEmail, placeholderEmailFor, placeholderPhone, realEmail } from './placeholder-email'

describe('placeholder email', () => {
    it('is built from the digits of the number', () => {
        expect(placeholderEmailFor('+33612345678')).toBe('33612345678@phone.lumvika.com')
    })

    it('is told apart from a real address', () => {
        expect(isPlaceholderEmail('33612345678@phone.lumvika.com')).toBe(true)
        expect(isPlaceholderEmail('33612345678@PHONE.lumvika.com')).toBe(true)
        expect(isPlaceholderEmail('ada@lumvika.com')).toBe(false)
        expect(isPlaceholderEmail('ada@phone.lumvika.com')).toBe(false)
        expect(isPlaceholderEmail(null)).toBe(false)
    })

    it('never passes for an address to write to', () => {
        expect(realEmail('33612345678@phone.lumvika.com')).toBeNull()
        expect(realEmail('ada@lumvika.com')).toBe('ada@lumvika.com')
        expect(realEmail(undefined)).toBeNull()
    })

    it('gives back the number behind the placeholder, and nothing for any other address', () => {
        expect(placeholderPhone('33612345678@phone.lumvika.com')).toBe('+33612345678')
        expect(placeholderPhone('ada@lumvika.com')).toBeNull()
        expect(placeholderPhone(deletedAccountEmailFor('3f4e7b94-0000-4000-8000-000000000001'))).toBeNull()
        expect(placeholderPhone(null)).toBeNull()
        expect(placeholderPhone(undefined)).toBeNull()
    })

    it('shows the number in place of the placeholder', () => {
        expect(accountLabel('33612345678@phone.lumvika.com')).toBe('+33 6 12 34 56 78')
        expect(accountLabel('ada@lumvika.com')).toBe('ada@lumvika.com')
        expect(accountLabel(null)).toBeNull()
    })

    it('files a deleted account where nothing is ever written to', () => {
        const email = deletedAccountEmailFor('3f4e7b94-0000-4000-8000-000000000001')
        expect(email).toBe('3f4e7b94-0000-4000-8000-000000000001@deleted.lumvika.com')
        expect(isDeletedAccountEmail(email)).toBe(true)
        expect(isDeletedAccountEmail('ada@lumvika.com')).toBe(false)
        expect(realEmail(email)).toBeNull()
        expect(accountLabel(email)).toBe('Deleted account')
    })
})
