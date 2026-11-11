'use server'

import { requireWorkspaceContext } from '@/app/api/_auth/ownership'
import type { StoredAgentIdeas } from '@/lib/agent-ideas/stored'
import { selectMaybeSingle } from '@/lib/db'

// The agents imagined for the workspace's company, or null when no run was ever asked for it.
export async function loadAgentIdeasAction(): Promise<StoredAgentIdeas | null> {
    const ctx = await requireWorkspaceContext()
    const { data } = await selectMaybeSingle(ctx.scope, 'workspace_onboarding', ['agent_ideas'] as const, { workspace_id: ctx.workspace.id })
    return (data?.agent_ideas ?? null) as StoredAgentIdeas | null
}
