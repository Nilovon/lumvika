import { describe, expect, it, vi } from 'vitest'

import type { StewardState } from './phase'

vi.mock('server-only', () => ({}))
vi.mock('./onboarding-tools', () => ({ dispatchOnboardingTool: vi.fn() }))
vi.mock('./search-docs', () => ({ searchStewardDocs: vi.fn() }))

const { stewardActiveTools } = await import('./tools')

function stateWith(patch: Partial<StewardState>): StewardState {
    return { phase: 'discover', intent: null, answers: {}, steward: {}, onboardingCompletedAt: null, firstName: '', language: null, entitled: false, trialSpent: false, trialNeedsCard: false, priceArm: '49', client: 'web', workspaceName: 'Acme', workspacePlan: 'none', userEmail: null, spaces: [], agents: [], ...patch }
}

describe('stewardActiveTools', () => {
    it('hands the app no contact_team: it has no team chat to open', () => {
        expect(stewardActiveTools(stateWith({ client: 'web' }))).toContain('contact_team')
        expect(stewardActiveTools(stateWith({ client: 'ios' }))).not.toContain('contact_team')
        expect(stewardActiveTools(stateWith({ client: 'ios', phase: 'trial' }))).toEqual(['search_docs'])
    })
})
