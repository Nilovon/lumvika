import { describe, expect, it } from 'vitest'
import { extractXBannerUrl, xUsername } from './x-scrape'
import { linkedinUsername } from './linkedin-scrape'

describe('xUsername', () => {
    it('reads the handle from a twitter.com hashbang URL and an @ path', () => {
        expect(xUsername('https://twitter.com/#!/jack')).toBe('jack')
        expect(xUsername('https://X.com/@jack/status/1')).toBe('jack')
    })

    it('accepts a bare handle with or without @', () => {
        expect(xUsername('  @jack_01 ')).toBe('jack_01')
        expect(xUsername('jack')).toBe('jack')
    })

    it('refuses the app routes whatever their case', () => {
        expect(() => xUsername('https://x.com/i/flow/login')).toThrow('Not an X profile URL')
        expect(() => xUsername('https://x.com/Settings')).toThrow('Not an X profile URL')
        expect(() => xUsername('home')).toThrow('Not an X profile URL')
    })

    it('refuses a bare word longer than a handle can be', () => {
        expect(() => xUsername('abcdefghijklmnop')).toThrow()
    })
})

describe('extractXBannerUrl', () => {
    it('pins the native size on a bare banner URL only', () => {
        expect(extractXBannerUrl({ profile: { coverPicture: 'https://pbs.twimg.com/profile_banners/1/2/' }, tweets: [] })).toBe('https://pbs.twimg.com/profile_banners/1/2/1500x500')
        expect(extractXBannerUrl({ profile: { coverPicture: 'https://pbs.twimg.com/profile_banners/1/2/600x200' }, tweets: [] })).toBe('https://pbs.twimg.com/profile_banners/1/2/600x200')
        expect(extractXBannerUrl({ profile: { coverPicture: 'data:x' }, tweets: [] })).toBeNull()
    })
})

describe('linkedinUsername', () => {
    it('decodes an encoded slug and drops a trailing slash of a bare value', () => {
        expect(linkedinUsername('https://www.linkedin.com/in/j%C3%A9r%C3%B4me')).toBe('jérôme')
        expect(linkedinUsername(' jane-doe/ ')).toBe('jane-doe')
    })

    it('refuses a malformed percent escape with its own error instead of a URIError', () => {
        expect(() => linkedinUsername('https://linkedin.com/in/%E0%A4%A')).toThrow('Not a LinkedIn profile link: https://linkedin.com/in/%E0%A4%A')
    })
})
