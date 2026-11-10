import { describe, expect, it } from 'vitest'

import { applyDiscoveryEvent, applyToRow, EMPTY_DISCOVERIES, rowToEvents, type CompanyFinding, type CompanyFindingsRow, type DiscoveryEvent } from './findings'

const identity = (name: string): CompanyFinding => ({ kind: 'identity', source: 'profile', name, oneLiner: null, logoUrl: null, domain: 'acme.com' })
const mail: CompanyFinding = { kind: 'mail', source: 'dns', provider: 'Google Workspace', iconUrl: null }

const play = (events: DiscoveryEvent[]) => events.reduce(applyDiscoveryEvent, EMPTY_DISCOVERIES)

describe('applyDiscoveryEvent', () => {
    it('lands a finding where its teaser stood', () => {
        const state = play([
            { type: 'pending', source: 'profile' },
            { type: 'pending', source: 'dns' },
            { type: 'found', source: 'dns', findings: [mail] },
            { type: 'found', source: 'profile', findings: [identity('Acme')] },
        ])
        const sorted = [...state.entries].sort((a, b) => a.order - b.order)
        expect(sorted.map(entry => entry.id)).toEqual(['finding:identity', 'finding:mail'])
    })

    it('updates a kind already shown instead of adding a second card', () => {
        const state = play([
            { type: 'found', source: 'stack', findings: [identity('acme.com')] },
            { type: 'found', source: 'profile', findings: [identity('Acme')] },
        ])
        expect(state.entries).toHaveLength(1)
        const [entry] = state.entries
        expect(entry.type === 'finding' && entry.finding.kind === 'identity' && entry.finding.name).toBe('Acme')
        expect(entry.type === 'finding' && entry.arrival).toBe(1)
    })

    it('drops the teaser of a source that found nothing', () => {
        expect(play([{ type: 'pending', source: 'registry' }, { type: 'dropped', source: 'registry' }]).entries).toEqual([])
    })

    it('clears the teasers left at the end, and digs again on the next wave', () => {
        const ended = play([{ type: 'pending', source: 'dns' }, { type: 'end' }])
        expect(ended).toMatchObject({ ended: true, entries: [] })
        expect(applyDiscoveryEvent(ended, { type: 'pending', source: 'site' }).ended).toBe(false)
    })
})

describe('the exploration row', () => {
    const empty: CompanyFindingsRow = { url: 'https://acme.com', status: 'running', pending: [], findings: [] }

    it('keeps one finding per kind and the sources still being read', () => {
        const row = [
            { type: 'pending', source: 'dns' },
            { type: 'pending', source: 'site' },
            { type: 'found', source: 'dns', findings: [mail] },
            { type: 'found', source: 'stack', findings: [identity('acme.com')] },
            { type: 'found', source: 'synthesis', findings: [identity('Acme')] },
        ].reduce((current, event) => applyToRow(current, event as DiscoveryEvent), empty)
        expect(row.pending).toEqual(['site'])
        expect(row.findings).toEqual([mail, identity('Acme')])
        expect(applyToRow(row, { type: 'end' })).toMatchObject({ status: 'done', pending: [] })
    })

    it('replays only what the board does not show yet', () => {
        const shown = play([{ type: 'found', source: 'dns', findings: [mail] }, { type: 'pending', source: 'registry' }])
        const events = rowToEvents({ ...empty, status: 'done', pending: [], findings: [mail, identity('Acme')] }, shown)
        expect(events).toEqual([{ type: 'found', source: 'profile', findings: [identity('Acme')] }, { type: 'dropped', source: 'registry' }, { type: 'end' }])
    })

    it('does not count a card landing twice as news', () => {
        const state = play([
            { type: 'found', source: 'dns', findings: [mail] },
            { type: 'found', source: 'dns', findings: [mail] },
        ])
        expect(state.arrivals).toBe(1)
    })
})
