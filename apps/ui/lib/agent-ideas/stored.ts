import type { AgentSuggestion } from '@/lib/onboarding/agent-suggestions'
import type { AgentIdea, Lens } from './types'

// What `workspace_onboarding.agent_ideas` holds: the ideas imagined for this company, cut down to
// what the New agent dialog draws and sends. The evidence and the scores stay in the lab.
export type StoredIdea = { id: string; name: string; hook: string; lens: Lens; kickoff: string; apps: string[] }

// Written 'running' before the run starts, so a reader can tell "not imagined yet" from "nothing
// worth proposing".
export type StoredAgentIdeas = { status: 'running' | 'done' | 'failed'; generatedAt: string; ideas: StoredIdea[] }

// Enough to give each Box of a board a couple of its own, short enough to stay the best of the run.
export const MAX_STORED_IDEAS = 12

function ideaId(name: string): string {
    return `idea-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`
}

export function toStoredIdeas(eligible: AgentIdea[]): StoredIdea[] {
    return eligible
        .filter(idea => idea.kickoff)
        .slice(0, MAX_STORED_IDEAS)
        .map(idea => ({ id: ideaId(idea.name), name: idea.name, hook: idea.hook, lens: idea.lens, kickoff: idea.kickoff, apps: idea.connectors.map(connector => connector.slug) }))
}

export function toAgentSuggestion(idea: StoredIdea): AgentSuggestion {
    return { id: idea.id, title: idea.name, description: idea.hook, name: idea.name, kickoff: idea.kickoff, apps: idea.apps }
}
