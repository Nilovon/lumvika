import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

process.env.RERUN_DATA_DIR = mkdtempSync(resolve(tmpdir(), 'rerun-paid-sources-'))

const { describe, expect, it } = await import('vitest')
const { createClient } = await import('@libsql/client')
const { migrateSystemDb } = await import('../db/systemDb.js')
const { cellKeys, emailKey, extractPaidItems, nameKey, paidCallVerdict, paidItemKeys, phoneKey, webKeys } = await import('./sources.js')
const { readPaidSources, writePaidSources } = await import('./store.js')

let files = 0
async function freshIndex() {
    const client = createClient({ url: `file:${resolve(process.env.RERUN_DATA_DIR!, `index-${files++}.db`)}` })
    await migrateSystemDb(client, 'index.db')
    return client
}

const places = [
    { title: 'Boulangerie Dupont', address: '3 rue de la Paix, Paris', city: 'Paris', phone: '+33 1 42 00 00 01', website: 'https://www.boulangerie-dupont.fr/', maps_url: 'https://maps.google.com/?cid=111', thumbnail: 'https://lh5.googleusercontent.com/p/a.jpg' },
    { title: 'Café Lumière', address: '8 avenue Foch, Paris', city: 'Paris', phone: '01 42 00 00 02', website: 'http://cafe-lumiere.com/menu?utm=x', maps_url: 'https://maps.google.com/?cid=222' },
]

const people = [
    { name: 'Jane Doe', title: 'CEO', city: 'Paris', email: 'Jane@Acme.com', linkedin_url: 'https://fr.linkedin.com/in/jane-doe/', company: { name: 'Acme', domain: 'acme.com' } },
    { first_name: 'Élodie', last_name: 'Martin', title: 'CEO', city: 'Paris', company_name: 'Globex' },
]

describe('normalizing a value into a key', () => {
    it('reads an email whatever its case or mailto prefix, and nothing that is not one', () => {
        expect(emailKey(' mailto:Jane@Acme.COM ')).toBe('e:jane@acme.com')
        expect(emailKey('jane at acme.com')).toBeNull()
        expect(emailKey('jane@acme')).toBeNull()
    })

    it('keys a phone on its last nine digits so a national and an international form meet', () => {
        expect(phoneKey('+33 1 42 00 00 01')).toBe('p:142000001')
        expect(phoneKey('01 42 00 00 01')).toBe('p:142000001')
        expect(phoneKey('tel:+1 (415) 555-0100')).toBe('p:155550100')
        expect(phoneKey('1234567')).toBeNull()
        expect(phoneKey('Paris 75001')).toBeNull()
    })

    it('keys a website by its domain, without the scheme, www, query, hash nor trailing slash', () => {
        expect(webKeys('https://www.Acme.com/')).toEqual(['d:acme.com'])
        expect(webKeys('acme.com')).toEqual(['d:acme.com'])
        expect(webKeys('http://acme.com/about/?utm=1#team')).toEqual(['d:acme.com', 'u:acme.com/about'])
    })

    it('never keys a shared host alone, only the page on it', () => {
        expect(webKeys('https://www.google.com')).toEqual([])
        expect(webKeys('https://maps.google.com/?cid=111')).toEqual(['u:maps.google.com?cid=111'])
        expect(webKeys('https://www.facebook.com/boulangerie.dupont')).toEqual(['u:facebook.com/boulangerie.dupont'])
        expect(webKeys('jane@gmail.com')).toEqual([])
    })

    it('keys a LinkedIn profile or company page by its slug', () => {
        expect(webKeys('https://fr.linkedin.com/in/Jane-Doe/')).toEqual(['li:jane-doe'])
        expect(webKeys('linkedin.com/company/acme?trk=1')).toEqual(['li:acme'])
    })

    it('folds a name to plain lowercase letters', () => {
        expect(nameKey('  Café   LUMIÈRE ')).toBe('n:cafe lumiere')
        expect(nameKey('Jo')).toBeNull()
        expect(nameKey('x'.repeat(121))).toBeNull()
    })
})

describe('extracting the items of an answer', () => {
    it('takes the objects of its lists, keeping their scalar fields and a link', () => {
        const items = extractPaidItems({ places, search_parameters: { q: 'boulangerie' } })
        expect(items).toHaveLength(2)
        expect(items[0].fields).toMatchObject({ title: 'Boulangerie Dupont', phone: '+33 1 42 00 00 01', city: 'Paris' })
        expect(items[0].href).toBe('https://www.boulangerie-dupont.fr/')
        expect(Object.keys(items[0].fields).length).toBeLessThanOrEqual(12)
    })

    it('reads the answer itself as the item when it holds no list', () => {
        const [item] = extractPaidItems({ email: 'jane@acme.com', first_name: 'Jane', last_name: 'Doe' })
        expect(item.fields).toMatchObject({ email: 'jane@acme.com', full_name: 'Jane Doe' })
    })

    it('keys the email, phone, website and names, never a city, a job title nor an image', () => {
        const [place] = extractPaidItems({ places })
        expect(
            paidItemKeys(place)
                .map(({ key }) => key)
                .sort()
        ).toEqual(['d:boulangerie-dupont.fr', 'n:boulangerie dupont', 'p:142000001', 'u:maps.google.com?cid=111'])

        const [jane, elodie] = extractPaidItems({ people })
        expect(paidItemKeys(jane)).toEqual(
            expect.arrayContaining([
                { key: 'e:jane@acme.com', field: 'email' },
                { key: 'li:jane-doe', field: 'linkedin_url' },
                { key: 'n:jane doe', field: 'name' },
                { key: 'n:acme', field: 'company.name' },
            ])
        )
        expect(paidItemKeys(jane).map(({ key }) => key)).not.toContain('n:ceo')
        expect(
            paidItemKeys(elodie)
                .map(({ key }) => key)
                .sort()
        ).toEqual(['n:elodie martin', 'n:globex'])
    })

    it('caps a call at 500 items', () => {
        expect(extractPaidItems({ rows: Array.from({ length: 700 }, (_, i) => ({ email: `p${i}@acme.com` })) })).toHaveLength(500)
    })
})

describe('the email check of a call', () => {
    it('reads a finder verdict and a verification bought on its own', () => {
        expect(paidCallVerdict('people.email.find', {}, { output: { email: 'jane@acme.com' }, verification: { verdict: 'Valid' } })).toEqual({ verdict: 'valid' })
        expect(paidCallVerdict('people.email.verify', { email: 'jane@acme.com' }, { output: { status: 'invalid' } })).toEqual({ verdict: 'invalid', verifiedEmail: 'jane@acme.com' })
        expect(paidCallVerdict('google.serp.maps', {}, { output: {} })).toEqual({})
    })
})

describe('reading where the rows of a table come from', () => {
    it('traces each cell of a row tied by a strong key, with the link and the call', async () => {
        const client = await freshIndex()
        await writePaidSources(client, { callId: 'maps-1', at: '2026-11-01T10:00:00.000Z', capability: 'google.serp.maps', servedBy: 'serpapi.maps', output: { places } })

        const result = await readPaidSources(
            [client],
            [
                { name: 'Boulangerie Dupont', site: 'boulangerie-dupont.fr', phone: '01 42 00 00 01', city: 'Paris', note: 'call back' },
                { name: 'Somewhere else', city: 'Paris' },
            ]
        )

        expect(result.calls).toEqual({ 'maps-1': { capability: 'google.serp.maps', servedBy: 'serpapi.maps', at: '2026-11-01T10:00:00.000Z' } })
        expect(result.rows[0].sources).toEqual(['maps-1'])
        expect(result.rows[0].cells).toEqual({
            name: { call: 'maps-1', field: 'title', href: 'https://www.boulangerie-dupont.fr/' },
            site: { call: 'maps-1', field: 'website', href: 'https://www.boulangerie-dupont.fr/' },
            phone: { call: 'maps-1', field: 'phone', href: 'https://www.boulangerie-dupont.fr/' },
            city: { call: 'maps-1', field: 'city', href: 'https://www.boulangerie-dupont.fr/' },
        })
        expect(result.rows[1]).toEqual({ sources: [], cells: {} })
    })

    it('never ties a row on a shared city or job title alone', async () => {
        const client = await freshIndex()
        await writePaidSources(client, { callId: 'people-1', at: '2026-11-01T10:00:00.000Z', capability: 'people.search', servedBy: null, output: { people } })

        const result = await readPaidSources(
            [client],
            [
                { role: 'CEO', city: 'Paris' },
                { name: 'Jane Doe', city: 'Lyon' },
            ]
        )

        expect(result.rows).toEqual([
            { sources: [], cells: {} },
            { sources: [], cells: {} },
        ])
    })

    it('ties a row on two names of the same item, and on a name and a LinkedIn page', async () => {
        const client = await freshIndex()
        await writePaidSources(client, { callId: 'people-1', at: '2026-11-01T10:00:00.000Z', capability: 'people.search', servedBy: null, output: { people } })

        const result = await readPaidSources(
            [client],
            [
                { person: 'Elodie Martin', company: 'GLOBEX', role: 'CEO' },
                { person: 'Jane Doe', profile: 'linkedin.com/in/jane-doe' },
            ]
        )

        expect(result.rows[0].sources).toEqual(['people-1'])
        expect(result.rows[0].cells).toMatchObject({ person: { field: 'full_name' }, company: { field: 'company_name' }, role: { field: 'title' } })
        expect(result.rows[1].cells).toMatchObject({ person: { field: 'name' }, profile: { field: 'linkedin_url', href: 'https://fr.linkedin.com/in/jane-doe/' } })
    })

    it('gives the most recent call a value came from, and the latest verdict of an email', async () => {
        const client = await freshIndex()
        await writePaidSources(client, { callId: 'find-1', at: '2026-11-01T10:00:00.000Z', capability: 'people.email.find', servedBy: 'hunter', output: { email: 'jane@acme.com', first_name: 'Jane', last_name: 'Doe' }, verdict: 'accept_all' })
        await writePaidSources(client, { callId: 'verify-1', at: '2026-11-02T10:00:00.000Z', capability: 'people.email.verify', servedBy: 'zerobounce', output: { status: 'valid' }, verdict: 'valid', verifiedEmail: 'Jane@acme.com' })

        const result = await readPaidSources([client], [{ email: 'JANE@acme.com', name: 'Jane Doe' }])

        expect(result.rows[0].sources).toEqual(['verify-1', 'find-1'])
        expect(result.rows[0].cells.email).toEqual({ call: 'verify-1', field: 'email', verdict: 'valid' })
        expect(result.rows[0].cells.name).toEqual({ call: 'find-1', field: 'full_name' })
    })

    it('indexes the same call once, whoever writes it again', async () => {
        const client = await freshIndex()
        const record = { callId: 'maps-1', at: '2026-11-01T10:00:00.000Z', capability: 'google.serp.maps', servedBy: null, output: { places } }
        await writePaidSources(client, record)
        await writePaidSources(client, record)
        expect((await client.execute('SELECT count(*) AS n FROM paid_items')).rows[0].n).toBe(2)
    })

    it('reads a strong key from a cell whatever its column is called', () => {
        expect(cellKeys('x', 'https://acme.com').strong).toEqual(['d:acme.com'])
        expect(cellKeys('x', 33142000001).strong).toEqual([])
        expect(cellKeys('Phone', 33142000001).strong).toEqual(['p:142000001'])
        expect(cellKeys('x', 'Paris')).toEqual({ strong: [], weak: 'n:paris' })
    })
})
