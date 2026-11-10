import { describe, expect, it } from 'vitest'

import { detectExpertSource, normalizeProfileUrl } from './source'
import { canonicalXUrl, extractXBannerUrl, extractXPhotoUrl, xUsername, type RawXProfile } from './x-scrape'
import { linkedinUsername } from './linkedin-scrape'

function detect(raw: string) {
    const url = normalizeProfileUrl(raw)
    return url ? detectExpertSource(url) : null
}

describe('detectExpertSource', () => {
    it('recognises linkedin profiles', () => {
        expect(detect('https://www.linkedin.com/in/jane-doe')).toBe('linkedin')
        expect(detect('linkedin.com/in/jane-doe')).toBe('linkedin')
        expect(detect('https://fr.linkedin.com/in/jane-doe')).toBe('linkedin')
    })

    it('recognises x profiles', () => {
        expect(detect('https://x.com/johnsmith')).toBe('x')
        expect(detect('https://twitter.com/johnsmith')).toBe('x')
        expect(detect('x.com/johnsmith?s=21')).toBe('x')
        expect(detect('https://mobile.twitter.com/johnsmith')).toBe('x')
    })

    it('rejects hostnames that merely contain a known domain', () => {
        expect(detect('https://evil.com/x.com')).toBe(null)
        expect(detect('https://x.com.evil.com/johnsmith')).toBe(null)
        expect(detect('https://notlinkedin.com/in/jane')).toBe(null)
    })

    it('rejects empty and unparseable lines', () => {
        expect(normalizeProfileUrl('   ')).toBe(null)
        expect(detect('not a url at all')).toBe(null)
    })
})

describe('xUsername', () => {
    it('extracts the handle from every profile URL shape', () => {
        expect(xUsername('https://x.com/johnsmith')).toBe('johnsmith')
        expect(xUsername('https://twitter.com/johnsmith/')).toBe('johnsmith')
        expect(xUsername('https://x.com/johnsmith?s=21')).toBe('johnsmith')
        expect(xUsername('https://x.com/johnsmith/status/123')).toBe('johnsmith')
        expect(xUsername('@johnsmith')).toBe('johnsmith')
    })

    it('rejects app routes and handle-less URLs', () => {
        expect(() => xUsername('https://x.com/i/flow/login')).toThrow()
        expect(() => xUsername('https://x.com/search?q=ai')).toThrow()
        expect(() => xUsername('https://x.com/')).toThrow()
    })

    it('canonicalises to x.com', () => {
        expect(canonicalXUrl(xUsername('https://twitter.com/johnsmith?s=21'))).toBe('https://x.com/johnsmith')
    })
})

describe('linkedinUsername', () => {
    it('extracts the slug', () => {
        expect(linkedinUsername('https://www.linkedin.com/in/jane-doe/')).toBe('jane-doe')
        expect(linkedinUsername('https://fr.linkedin.com/in/jane-doe?originalSubdomain=fr')).toBe('jane-doe')
    })
})

function profileWith(fields: Record<string, unknown>): RawXProfile {
    return { profile: fields, tweets: [] }
}

describe('x image extraction', () => {
    it('upgrades the avatar thumbnail to the 400px variant', () => {
        expect(extractXPhotoUrl(profileWith({ profilePicture: 'https://pbs.twimg.com/profile_images/1/a_normal.jpg' })))
            .toBe('https://pbs.twimg.com/profile_images/1/a_400x400.jpg')
    })

    it('leaves an already sized avatar alone and ignores junk', () => {
        expect(extractXPhotoUrl(profileWith({ profilePicture: 'https://pbs.twimg.com/profile_images/1/a.png' })))
            .toBe('https://pbs.twimg.com/profile_images/1/a.png')
        expect(extractXPhotoUrl(profileWith({ profilePicture: '' }))).toBe(null)
        expect(extractXPhotoUrl(profileWith({}))).toBe(null)
    })

    it('asks for the native banner size when none is set', () => {
        expect(extractXBannerUrl(profileWith({ coverPicture: 'https://pbs.twimg.com/profile_banners/12/34' })))
            .toBe('https://pbs.twimg.com/profile_banners/12/34/1500x500')
        expect(extractXBannerUrl(profileWith({ coverPicture: 'https://pbs.twimg.com/profile_banners/12/34/1500x500' })))
            .toBe('https://pbs.twimg.com/profile_banners/12/34/1500x500')
        expect(extractXBannerUrl(profileWith({}))).toBe(null)
    })
})
