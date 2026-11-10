import { describe, expect, it } from 'vitest'

import { groundCandidates } from './ground'
import type { AgentCandidate, CatalogApp, Evidence } from './types'

const evidence: Evidence[] = [
    { id: 'E1', source: 'findings:reviews', topic: 'Google reviews', text: 'Rated 4.8 from 127 Google reviews' },
    { id: 'E2', source: 'brain:stack', topic: 'Stack', text: 'Uses Shopify' },
]

const catalog: CatalogApp[] = [
    { slug: 'gmail', name: 'Gmail', category: 'email', summary: 'Email', icon: 'gmail.svg' },
    { slug: 'google-sheets', name: 'Google Sheets', category: 'data', summary: 'Spreadsheets', icon: null },
]

function candidate(overrides: Partial<AgentCandidate>): AgentCandidate {
    return {
        name: 'Review Responder',
        role: 'Replies to every Google review within the day',
        hook: 'You hold 127 Google reviews.',
        lens: 'support',
        evidenceIds: ['E1'],
        steps: ['Reads the new reviews', 'Drafts a reply', 'Asks for approval'],
        when: 'When a review is posted',
        connectors: ['gmail'],
        missingApps: [],
        firstRun: 'A drafted reply to the latest review',
        kickoff: 'Reply to my Google reviews as they come in.',
        ...overrides,
    }
}

const dossier = { evidence, existingAgents: [{ name: 'Inbox Concierge', description: 'Answers order emails' }] }

describe('groundCandidates', () => {
    it('resolves citations to the facts themselves and drops the ids that point at nothing', () => {
        const { grounded } = groundCandidates([candidate({ evidenceIds: ['E1', '[E2]', 'E99', 'E1'] })], dossier, catalog)

        expect(grounded[0].evidence.map(item => item.id)).toEqual(['E1', 'E2'])
    })

    it('drops a candidate that cites nothing real', () => {
        const { grounded, dropped } = groundCandidates([candidate({ evidenceIds: ['E99'] })], dossier, catalog)

        expect(grounded).toEqual([])
        expect(dropped).toEqual([{ name: 'Review Responder', role: 'Replies to every Google review within the day', reason: 'Ne cite aucune preuve du dossier' }])
    })

    it('reports an unknown app as missing and finds one the model filed under the wrong list', () => {
        const { grounded } = groundCandidates([candidate({ connectors: ['gmail', 'google-reviews'], missingApps: ['Google Sheets', 'Trustpilot'] })], dossier, catalog)

        expect(grounded[0].connectors.map(connector => connector.slug)).toEqual(['gmail', 'google-sheets'])
        expect(grounded[0].missingApps).toEqual(['google-reviews', 'Trustpilot'])
    })

    it('refuses the name of an agent they already have and a name used twice', () => {
        const { grounded, dropped } = groundCandidates([candidate({ name: 'inbox concierge' }), candidate({}), candidate({ role: 'Second of the name' })], dossier, catalog)

        expect(grounded.map(item => item.name)).toEqual(['Review Responder'])
        expect(dropped.map(item => item.name)).toEqual(['inbox concierge', 'Review Responder'])
    })

    it('strips the dashes the models slip in', () => {
        const { grounded } = groundCandidates([candidate({ hook: 'Lomi launched a subscription — you heard it from a customer.' })], dossier, catalog)

        expect(grounded[0].hook).toBe('Lomi launched a subscription, you heard it from a customer.')
    })
})
