import { describe, expect, it } from 'vitest'

import { displayNameOf, readProfile } from './user-profile'

describe('readProfile', () => {
    it('reads the name and the photo the account holds', () => {
        expect(readProfile({ name: 'Ada Lovelace', image: 'https://cdn.lumvika.com/user-avatars/ada.webp' })).toEqual({ name: 'Ada Lovelace', avatarUrl: 'https://cdn.lumvika.com/user-avatars/ada.webp' })
    })

    it('shows no photo once it was removed', () => {
        expect(readProfile({ name: 'Ada Google', image: null })).toEqual({ name: 'Ada Google', avatarUrl: null })
    })

    it('has nothing to show for an account that never gave a name or a photo', () => {
        expect(readProfile({ name: '', image: '' })).toEqual({ name: null, avatarUrl: null })
    })

    it('never shows the name every anonymous visitor is given', () => {
        expect(readProfile({ name: 'Anonymous', image: null })).toEqual({ name: null, avatarUrl: null })
    })
})

describe('displayNameOf', () => {
    it('falls back on the front of the address, never on a placeholder one', () => {
        expect(displayNameOf({ name: '', image: null, email: 'ada@lumvika.com' })).toBe('ada')
        expect(displayNameOf({ name: 'Anonymous', image: null, email: '8f2c@anonymous.lumvika.invalid' })).toBeNull()
        expect(displayNameOf({ name: '', image: null, email: null })).toBeNull()
    })

    it('never shows the random front of an Apple relay address as a name', () => {
        expect(displayNameOf({ name: '', image: null, email: 'x7k2abc9@privaterelay.appleid.com' })).toBeNull()
        expect(displayNameOf({ name: 'Ada Lovelace', image: null, email: 'x7k2abc9@privaterelay.appleid.com' })).toBe('Ada Lovelace')
    })
})
