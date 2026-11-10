import { describe, expect, it } from 'vitest'

import type { StewardState } from './phase'
import { createStewardTurn } from './turn'

const fresh: StewardState = {
    phase: 'discover',
    intent: null,
    answers: {},
    steward: {},
    onboardingCompletedAt: null,
    firstName: 'Clément',
    language: 'fr',
    entitled: false,
    trialSpent: false,
    trialNeedsCard: true,
    priceArm: '49',
    client: 'web',
    workspaceName: 'Retalk',
    workspacePlan: 'base',
    userEmail: 'founder@acme-support.example',
    spaces: [],
    agents: [],
}

const plan = { title: 'Retalk SEO Team', items: [{ kind: 'agent' as const, name: 'Scout', role: 'keyword research' }] }

describe('createStewardTurn', () => {
    // The bug this exists for: save_profile used to land on a phase resolved before the turn
    // started, so the model kept the belt of the step it had just left.
    it('walks discover to the plan when the profile is saved mid-turn', () => {
        const turn = createStewardTurn(fresh)
        expect(turn.state().phase).toBe('discover')

        turn.note('save_profile', { saved: true, profile: { company_url: 'acme-support.example', steward: { profileAt: '2026-09-21T10:00:00Z' } } })
        expect(turn.state().phase).toBe('plan')
    })

    it('leaves the phase alone for a tool that writes nothing it reads', () => {
        const turn = createStewardTurn({ ...fresh, steward: { profileAt: 'then', plan }, phase: 'trial' })
        turn.note('search_docs', { results: [] })
        expect(turn.state().phase).toBe('trial')
    })

    it('ignores a result that carries nothing it can act on', () => {
        const turn = createStewardTurn(fresh)
        turn.note('save_profile', { saved: true })
        expect(turn.state().phase).toBe('discover')
    })
})
