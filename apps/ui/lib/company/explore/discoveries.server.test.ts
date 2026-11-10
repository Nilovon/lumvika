import { describe, expect, it } from 'vitest'

import type { CompanyProfile } from '../analyze'
import { createDiscoveryTranslator, emptyDiscoveryDraft, findingsForCollector, findingsForProfile } from './discoveries.server'
import type { ExploreEvent } from './explore'
import type { CollectorData } from './types'

const DOMAIN = 'acme.com'

const stack: CollectorData['stack'] = {
    finalUrl: 'https://acme.com',
    technologies: [
        { name: 'Next.js', category: 'Framework' },
        { name: 'HubSpot', category: 'CRM / marketing' },
    ],
    meta: { title: 'Acme', description: 'Home page blurb', siteName: 'Acme Inc', ogImage: null, themeColor: null, favicon: 'https://acme.com/favicon.png', lang: 'en' },
    social: { instagram: 'https://instagram.com/acme' },
}

const dns: CollectorData['dns'] = { mailProvider: 'Google Workspace', mx: [], services: [{ name: 'Hubspot', evidence: 'txt' }, { name: 'Slack', evidence: 'txt' }], spfIncludes: [], dmarcPolicy: null, txt: [] }

const profile: CompanyProfile = { name: 'Acme', industry: 'ecommerce', description: 'Roasts coffee in Lyon.', offering: 'Coffee', audience: 'Coffee lovers' }

const done = (id: ExploreEvent extends infer E ? (E extends { type: 'done'; id: infer I } ? I : never) : never, data: unknown): ExploreEvent => ({ type: 'done', id, durationMs: 1, output: { data, highlights: [] } })

describe('findingsForCollector', () => {
    it('keeps what the company works with, not what its site is built on', () => {
        const findings = findingsForCollector('stack', stack, emptyDiscoveryDraft(), DOMAIN)
        const tools = findings.find(finding => finding.kind === 'tools')
        expect(tools?.kind === 'tools' && tools.tools.map(tool => tool.name)).toEqual(['HubSpot'])
        expect(findings.map(finding => finding.kind)).toEqual(['identity', 'tools', 'social'])
    })

    it('merges the tools of the DNS and of the page into one card', () => {
        const draft = emptyDiscoveryDraft()
        findingsForCollector('dns', dns, draft, DOMAIN)
        expect(findingsForCollector('stack', stack, draft, DOMAIN).some(finding => finding.kind === 'tools')).toBe(false)
        const withCalendly = { ...stack, technologies: [...stack.technologies, { name: 'Calendly', category: 'Prise de RDV' }] }
        const tools = findingsForCollector('stack', withCalendly, draft, DOMAIN).find(finding => finding.kind === 'tools')
        expect(tools?.kind === 'tools' && tools.tools.map(tool => tool.name)).toEqual(['Hubspot', 'Slack', 'Calendly'])
    })

    it('leaves out a registry entry matched by name alone', () => {
        const company = { siren: '1', name: 'Acme', naf: null, category: null, createdAt: '2016-03-01', headcount: '10-19', active: true, address: null, city: 'Lyon', officers: [], finances: null }
        expect(findingsForCollector('registry', { matchedBy: 'name', query: 'acme', personIsOfficer: false, company, candidates: [] }, emptyDiscoveryDraft(), DOMAIN)).toEqual([])
        expect(findingsForCollector('registry', { matchedBy: 'siren', query: '1', personIsOfficer: false, company, candidates: [] }, emptyDiscoveryDraft(), DOMAIN)).toEqual([
            { kind: 'registry', source: 'registry', founded: '2016', headcount: '10-19', city: 'Lyon' },
        ])
    })

    it('leaves out a LinkedIn page or a Google place that points to another site', () => {
        expect(findingsForCollector('linkedinCompany', { source: 'name', query: 'acme', matchesWebsite: false, company: { followerCount: 900 } }, emptyDiscoveryDraft(), DOMAIN)).toEqual([])
        expect(findingsForCollector('googleBusiness', { query: 'acme', location: null, matchesWebsite: false, place: { totalScore: 4.8, reviewsCount: 12 } }, emptyDiscoveryDraft(), DOMAIN)).toEqual([])
    })

    it('makes no card out of an empty source', () => {
        expect(findingsForCollector('dns', { ...dns, mailProvider: null, services: [] }, emptyDiscoveryDraft(), DOMAIN)).toEqual([])
        expect(findingsForCollector('googleBusiness', { query: 'acme', location: null, matchesWebsite: true, place: {} }, emptyDiscoveryDraft(), DOMAIN)).toEqual([])
    })

    it('keeps the one-liner of the read of the site when the page lands after it', () => {
        const draft = emptyDiscoveryDraft()
        findingsForProfile(profile, draft, DOMAIN)
        expect(findingsForCollector('stack', stack, draft, DOMAIN).find(finding => finding.kind === 'identity')).toEqual({
            kind: 'identity',
            source: 'stack',
            name: 'Acme',
            oneLiner: 'Roasts coffee in Lyon.',
            logoUrl: 'https://acme.com/favicon.png',
            domain: DOMAIN,
        })
    })
})

describe('createDiscoveryTranslator', () => {
    const icons = async (names: string[]) => new Map(names.filter(name => name.toLowerCase() === 'hubspot').map(name => [name.toLowerCase(), 'https://icons/hubspot.svg']))

    it('turns a run into teasers, cards with their icons, and drops', async () => {
        const translator = createDiscoveryTranslator({ domain: DOMAIN, icons })
        expect(await translator.fromExplore({ type: 'running', id: 'dns' })).toEqual([{ type: 'pending', source: 'dns' }])
        const [found] = await translator.fromExplore(done('dns', dns))
        const tools = found.type === 'found' ? found.findings.find(finding => finding.kind === 'tools') : null
        expect(tools?.kind === 'tools' && tools.tools).toEqual([
            { name: 'Hubspot', iconUrl: 'https://icons/hubspot.svg' },
            { name: 'Slack', iconUrl: null },
        ])
        expect(await translator.fromExplore({ type: 'skipped', id: 'site', reason: 'Désactivé' })).toEqual([])
        await translator.fromExplore({ type: 'running', id: 'registry' })
        expect(await translator.fromExplore({ type: 'error', id: 'registry', durationMs: 1, error: 'boom' })).toEqual([{ type: 'dropped', source: 'registry' }])
    })

    it('drops the read of the site when it came back empty', async () => {
        const translator = createDiscoveryTranslator({ domain: DOMAIN, icons })
        expect(await translator.fromProfile(null)).toEqual([{ type: 'dropped', source: 'profile' }])
    })
})
