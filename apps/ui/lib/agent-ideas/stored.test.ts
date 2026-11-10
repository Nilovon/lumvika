import { describe, expect, it } from 'vitest'

import { MAX_STORED_IDEAS, toAgentSuggestion, toStoredIdeas } from './stored'
import type { AgentIdea } from './types'

function withApps(name: string, slugs: string[], kickoff = 'Do the job.'): AgentIdea {
    return { name, kickoff, hook: 'A fact.', lens: 'support', connectors: slugs.map(slug => ({ slug, name: slug, category: 'email', icon: null })) } as Partial<AgentIdea> as AgentIdea
}

describe('toStoredIdeas', () => {
    it('keeps what the dialog draws and sends, under an id read off the name', () => {
        expect(toStoredIdeas([withApps('Review Responder (FR)', ['gmail', 'slack'])])).toEqual([{ id: 'idea-review-responder-fr', name: 'Review Responder (FR)', hook: 'A fact.', lens: 'support', kickoff: 'Do the job.', apps: ['gmail', 'slack'] }])
    })

    it('leaves out an idea with no first message and stops at the cap', () => {
        const ideas = [withApps('Mute', [], ''), ...Array.from({ length: MAX_STORED_IDEAS + 3 }, (_, index) => withApps(`Idea ${index}`, []))]
        const stored = toStoredIdeas(ideas)

        expect(stored).toHaveLength(MAX_STORED_IDEAS)
        expect(stored[0].name).toBe('Idea 0')
    })
})

describe('toAgentSuggestion', () => {
    it('shows the hook under the cursor and writes the kickoff in the field', () => {
        const [stored] = toStoredIdeas([withApps('Review Responder', ['gmail'])])

        expect(toAgentSuggestion(stored)).toEqual({ id: 'idea-review-responder', title: 'Review Responder', description: 'A fact.', name: 'Review Responder', kickoff: 'Do the job.', apps: ['gmail'] })
    })
})
