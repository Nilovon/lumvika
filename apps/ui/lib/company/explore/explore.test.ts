import { describe, expect, it } from 'vitest'

import { nameFromTitle } from './company-name'
import { readDnsRecords } from './dns'
import { findPersonProfile } from './linkedin-person'
import { findSiren } from './registry'
import type { SearchFindings } from './search'
import { pickPages, productUrlsOf, type SiteFindings } from './site'
import { linkedinPeople, mentionsName, socialProfiles } from './social'
import { detectTechnologies } from './stack'
import type { ExploreInput } from './types'

describe('readDnsRecords', () => {
    it('reads the mail provider, the SPF senders and the verification tokens', () => {
        const findings = readDnsRecords({
            mx: ['aspmx.l.google.com', 'alt1.aspmx.l.google.com'],
            txt: [
                'v=spf1 include:_spf.google.com include:sendgrid.net include:servers.mcsv.net include:unknown.example ~all',
                'google-site-verification=abc',
                'facebook-domain-verification=xyz',
                'MS=ms123456',
                'acmecrm-domain-verification=42',
            ],
            dmarc: ['v=DMARC1; p=quarantine; rua=mailto:d@acme.com'],
        })
        expect(findings.mailProvider).toBe('Google Workspace')
        expect(findings.services.map(service => service.name)).toEqual(['Google Workspace', 'SendGrid', 'Mailchimp', 'Google Search Console', 'Meta Business', 'Microsoft 365', 'acmecrm'])
        expect(findings.spfIncludes).toContain('unknown.example')
        expect(findings.dmarcPolicy).toBe('quarantine')
        expect(findings.txt).not.toContainEqual(expect.stringMatching(/^v=spf1/))
    })

    it('stays empty on a domain with no records', () => {
        expect(readDnsRecords({ mx: [], txt: [], dmarc: [] })).toEqual({ mailProvider: null, mx: [], services: [], spfIncludes: [], dmarcPolicy: null, txt: [] })
    })
})

describe('detectTechnologies', () => {
    it('recognises scripts in the HTML and hosting from the headers', () => {
        const html = `<script src="https://cdn.shopify.com/s/x.js"></script><script src="https://widget.intercom.io/widget/abc"></script>
            <script async src="https://www.googletagmanager.com/gtag/js?id=G-1"></script><script>fbq('init')</script>`
        const names = detectTechnologies(html, new Headers({ 'cf-ray': '123' })).map(tech => tech.name)
        expect(names).toEqual(['Shopify', 'Intercom', 'Google Analytics', 'Meta Pixel', 'Cloudflare'])
    })
})

describe('pickPages', () => {
    it('takes the shallowest page of each category on the same site', () => {
        const picked = pickPages(
            [
                'https://www.acme.com/about/press-kit',
                'https://acme.com/about',
                'https://acme.com/fr/tarifs',
                'https://acme.com/mentions-legales',
                'https://other.com/pricing',
                'https://acme.com/blog/some-post',
                'not a url',
            ],
            'https://acme.com'
        )
        expect(picked).toEqual([
            { category: 'about', url: 'https://acme.com/about' },
            { category: 'pricing', url: 'https://acme.com/fr/tarifs' },
            { category: 'legal', url: 'https://acme.com/mentions-legales' },
            { category: 'blog', url: 'https://acme.com/blog/some-post' },
        ])
    })

    it('reads a shop listing as the product page', () => {
        expect(pickPages(['https://shop.com/products/coussin', 'https://shop.com/products'], 'https://shop.com')).toEqual([{ category: 'product', url: 'https://shop.com/products' }])
        expect(pickPages(['https://shop.com/collections/all'], 'https://shop.com')).toEqual([{ category: 'product', url: 'https://shop.com/collections/all' }])
    })
})

describe('productUrlsOf', () => {
    it('keeps the product sheets of the site, in order, once each', () => {
        expect(
            productUrlsOf(
                [
                    '/products/coussin-anti-chute?variant=1',
                    'https://www.shop.com/collections/bebe/products/harnais',
                    'https://shop.com/products',
                    'https://shop.com/products/coussin-anti-chute/',
                    'https://other.com/products/x',
                    'https://shop.com/fr/produit/tapis-eveil',
                    'https://shop.com/pages/about',
                ],
                'https://shop.com'
            )
        ).toEqual(['https://shop.com/products/coussin-anti-chute', 'https://www.shop.com/collections/bebe/products/harnais', 'https://shop.com/fr/produit/tapis-eveil'])
    })
})

describe('findSiren', () => {
    it('reads the SIREN or SIRET printed in a legal notice', () => {
        expect(findSiren('Société ACME SAS, RCS Paris 794 598 813')).toBe('794598813')
        expect(findSiren('SIRET : 79459881300045')).toBe('794598813')
        expect(findSiren('Call us on 01 23 45 67 89')).toBeNull()
    })
})

describe('social links', () => {
    it('keeps company profiles and drops share buttons and posts', () => {
        expect(
            socialProfiles([
                'https://www.facebook.com/sharer/sharer.php?u=x',
                'https://twitter.com/intent/tweet?text=x',
                'https://www.instagram.com/p/C123/',
                'https://www.linkedin.com/company/acme/',
                'https://x.com/acme',
                'https://www.instagram.com/acme.paris/',
                'https://www.youtube.com/@acme',
            ])
        ).toEqual({ linkedin: 'https://www.linkedin.com/company/acme', x: 'https://x.com/acme', instagram: 'https://www.instagram.com/acme.paris/', youtube: 'https://www.youtube.com/@acme' })
    })

    it('lists people profiles once', () => {
        expect(linkedinPeople(['https://fr.linkedin.com/in/jane-doe?trk=x', 'https://fr.linkedin.com/in/jane-doe', 'https://linkedin.com/company/acme'])).toEqual(['https://fr.linkedin.com/in/jane-doe'])
    })

    it('matches a name against a slug or a title, accents and case aside', () => {
        expect(mentionsName('helenedubois', 'Hélène Dubois')).toBe(true)
        expect(mentionsName('Hélène Dubois - Founder @ Acme | LinkedIn', 'helene dubois')).toBe(true)
        expect(mentionsName('helene-martin', 'Hélène Dubois')).toBe(false)
    })
})

describe('nameFromTitle', () => {
    it('skips boilerplate and prefers the part that matches the domain', () => {
        expect(nameFromTitle('Home | Acme', 'acme.com')).toBe('Acme')
        expect(nameFromTitle('Book a doctor online - Doctolib', 'www.doctolib.fr')).toBe('Doctolib')
        expect(nameFromTitle('Accueil', 'acme.com')).toBeNull()
        expect(nameFromTitle('. x X    Septime    X x .', 'septime-charonne.fr')).toBe('Septime')
    })
})

describe('findPersonProfile', () => {
    const input: ExploreInput = { url: 'https://acme.com', domain: 'acme.com', personName: 'Jane Doe', email: null, linkedinUrl: null }
    const site = { linkedinPeople: ['https://linkedin.com/in/john-smith', 'https://linkedin.com/in/jane-doe-123'] } as SiteFindings
    const search: SearchFindings = {
        queries: [{ kind: 'person', query: '', results: [{ url: 'https://fr.linkedin.com/in/janedoe', title: 'Jane Doe - CEO - Acme | LinkedIn', description: '' }] }],
    }

    it('prefers the typed URL, then the site, then the search', () => {
        expect(findPersonProfile({ ...input, linkedinUrl: 'https://linkedin.com/in/typed' }, site, search)).toEqual({ url: 'https://linkedin.com/in/typed', source: 'input' })
        expect(findPersonProfile(input, site, search)).toEqual({ url: 'https://linkedin.com/in/jane-doe-123', source: 'site' })
        expect(findPersonProfile(input, null, search)).toEqual({ url: 'https://fr.linkedin.com/in/janedoe', source: 'search' })
    })

    it('finds nobody without a name to match', () => {
        expect(findPersonProfile({ ...input, personName: null }, site, search)).toBeNull()
    })
})
