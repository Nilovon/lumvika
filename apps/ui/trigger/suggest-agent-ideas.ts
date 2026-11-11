import { task } from '@trigger.dev/sdk/v3'
import { taskLogger as logger } from '@lumvika/cloud/tasks'

import type { Json } from '@/app/api/database.types'
import { MAX_STORED_IDEAS, toStoredIdeas, type StoredAgentIdeas } from '@/lib/agent-ideas/stored'
import { suggestAgents } from '@/lib/agent-ideas/suggest'
import { serviceScope, upsertRows } from '@/lib/db'

export type SuggestAgentIdeasPayload = { workspaceId: number }

// The agents imagined for a company once its Brain is written, kept for the New agent dialog. Its
// own task rather than the tail of the brain seed: two model calls of up to three minutes each do
// not fit in the seed's budget, and a run that finds nothing must not fail a seed that worked.
export const suggestAgentIdeasTask = task({
    id: 'suggest-agent-ideas',
    maxDuration: 600,
    // A second attempt would pay for the two model calls again to hear the same answer.
    retry: { maxAttempts: 1 },
    run: (payload: SuggestAgentIdeasPayload) => suggestAgentIdeasRun(payload),
})

export async function suggestAgentIdeasRun({ workspaceId }: SuggestAgentIdeasPayload) {
    const scope = serviceScope()

    async function write(row: StoredAgentIdeas) {
        const { error } = await upsertRows(scope, 'workspace_onboarding', { workspace_id: workspaceId, agent_ideas: row as unknown as Json }, { onConflict: ['workspace_id'] })
        if (error) logger.warn('agent ideas: not written', { workspaceId, error: error.message })
    }

    await write({ status: 'running', generatedAt: new Date().toISOString(), ideas: [] })

    const selection = await suggestAgents(scope, workspaceId, event => {
        if (event.type === 'error') logger.warn('agent ideas: step failed', { workspaceId, step: event.step, error: event.error })
    })
    const ideas = selection ? toStoredIdeas(selection.eligible) : []
    await write({ status: selection ? 'done' : 'failed', generatedAt: new Date().toISOString(), ideas })

    logger.log('agent ideas: done', { workspaceId, stored: ideas.length, cap: MAX_STORED_IDEAS, failed: !selection })
    return { stored: ideas.length }
}
