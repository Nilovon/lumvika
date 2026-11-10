import { describe, expect, it } from 'vitest'

import { agentSuggestionsForIndustry, DEFAULT_AGENT_SUGGESTIONS, INDUSTRY_AGENT_SUGGESTIONS } from './agent-suggestions'

const LISTS = [...Object.entries(INDUSTRY_AGENT_SUGGESTIONS).filter(([, suggestions]) => suggestions.length > 0), ['default', DEFAULT_AGENT_SUGGESTIONS] as const]

describe('agent suggestions', () => {
    it.each(LISTS)('%s holds eight jobs, of which the dialog draws the first three', (_industry, suggestions) => {
        expect(suggestions).toHaveLength(8)
    })

    it.each(LISTS)('%s gives every suggestion its own id, a name and one to three apps', (_industry, suggestions) => {
        expect(new Set(suggestions.map(suggestion => suggestion.id)).size).toBe(suggestions.length)
        expect(new Set(suggestions.map(suggestion => suggestion.name)).size).toBe(suggestions.length)
        for (const suggestion of suggestions) {
            expect(suggestion.apps.length).toBeGreaterThanOrEqual(1)
            expect(suggestion.apps.length).toBeLessThanOrEqual(3)
        }
    })

    it('falls back to the default list for an industry it does not know or has nothing for', () => {
        expect(agentSuggestionsForIndustry(null)).toBe(DEFAULT_AGENT_SUGGESTIONS)
        expect(agentSuggestionsForIndustry('farming')).toBe(DEFAULT_AGENT_SUGGESTIONS)
        expect(agentSuggestionsForIndustry('other')).toBe(DEFAULT_AGENT_SUGGESTIONS)
        expect(agentSuggestionsForIndustry('sales')).toBe(INDUSTRY_AGENT_SUGGESTIONS.sales)
    })
})
