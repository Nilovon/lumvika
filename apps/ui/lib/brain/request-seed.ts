import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database, Json } from '@/app/api/database.types'
import { globalIdempotencyKey, triggerTask } from '@lumvika/cloud/tasks'
import type { CompanyFindingsRow } from '@/lib/company/explore/findings'
import { selectMaybeSingle } from '@/supabase/supabase-helpers'
import type { exploreCompanyTask } from '@/trigger/explore-company'
import type { seedCompanyBrain } from '@/trigger/seed-company-brain'
import type { suggestAgentIdeasTask } from '@/trigger/suggest-agent-ideas'

// Triggered by id with a type-only import: the task module reads the workspace engine service,
// which is one of the callers, and carries every collector of the exploration with it.
export async function requestCompanyBrainSeed(workspaceId: number, idempotencyKey: string, exploreKey?: string): Promise<boolean> {
    try {
        await triggerTask<typeof seedCompanyBrain>('seed-company-brain', { workspaceId, exploreKey }, { idempotencyKey })
        return true
    } catch (err) {
        console.error('Failed to request a company brain seed', workspaceId, err)
        return false
    }
}

// Asked once the Brain is written, since the Brain is most of what the ideas are imagined from. One
// run per seed: `seedKey` is what tells a "read my website again" from the first seed.
export async function requestAgentIdeas(workspaceId: number, seedKey: string): Promise<void> {
    try {
        await triggerTask<typeof suggestAgentIdeasTask>('suggest-agent-ideas', { workspaceId }, { idempotencyKey: await globalIdempotencyKey(`agent-ideas-${workspaceId}-${seedKey}`) })
    } catch (err) {
        console.error('Failed to request agent ideas', workspaceId, err)
    }
}

// One exploration per workspace and site: the onboarding starts it, the brain seed waits on it.
// `url` is always the one companySiteUrl gave back.
export function companyExploreKey(workspaceId: number, url: string): string {
    return `company-explore-${workspaceId}-${url}`
}

// Global so the seed, which triggers it from inside another run, lands on the same one.
export function companyExploreIdempotencyKey(key: string) {
    return globalIdempotencyKey(key)
}

// Starts the exploration the onboarding board shows card by card, unless this site already has one.
// The row is written before the run starts: with one exploration at a time, a run can wait in the
// queue, and the board keeps asking for as long as it reads 'running'.
export async function requestCompanyExplore(supabase: SupabaseClient<Database>, workspaceId: number, url: string): Promise<void> {
    const { data } = await selectMaybeSingle(supabase, 'workspace_onboarding', ['company_findings'] as const, { workspace_id: workspaceId })
    const current = data?.company_findings as CompanyFindingsRow | null | undefined
    if (current?.url === url) return

    const queued: CompanyFindingsRow = { url, status: 'running', pending: [], findings: [] }
    const { error } = await supabase
        .from('workspace_onboarding')
        .update<Database['public']['Tables']['workspace_onboarding']['Update']>({ company_findings: queued as unknown as Json })
        .eq('workspace_id', workspaceId)
    if (error) throw new Error(error.message)
    await triggerTask<typeof exploreCompanyTask>('explore-company', { workspaceId, url }, { idempotencyKey: await companyExploreIdempotencyKey(companyExploreKey(workspaceId, url)) })
}
