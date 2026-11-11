import 'server-only'

import { getWorkspaceConnection } from '@/app/api/_services/workspace-engine.service'
import { patchAgent } from '@/lib/engine/client'
import { selectMany, selectMaybeSingle, type DbScope } from '@/lib/db'
import { DEFAULT_LOCALE, isStableLocale } from '@lumvika/i18n'

// The language a new coworker of this workspace is given, null to leave it on the language of its
// instructions. A workspace that never left English is not pinned: the ones made before the column
// all read 'en', and pinning them would turn a German team's routines to English overnight.
export async function coworkerLanguageFor(scope: DbScope, workspaceId: number): Promise<string | null> {
    const { data } = await selectMaybeSingle(scope, 'workspaces', ['locale'] as const, { id: workspaceId })
    return isStableLocale(data?.locale) && data.locale !== DEFAULT_LOCALE ? data.locale : null
}

// An admin picked the coworkers' language on purpose: every coworker of the workspace takes it,
// English included. One that fails keeps its previous language and the others still change.
export async function applyCoworkerLanguage(scope: DbScope, workspaceId: number, language: string): Promise<void> {
    const { data: agents } = await selectMany(scope, 'agents', ['engine_agent_id'] as const, { workspace_id: workspaceId })
    const ids = (agents ?? []).map(agent => agent.engine_agent_id).filter((id): id is string => Boolean(id))
    if (!ids.length) return
    const conn = await getWorkspaceConnection(workspaceId)
    const results = await Promise.allSettled(ids.map(id => patchAgent(conn, id, { language })))
    const failed = results.filter(result => result.status === 'rejected').length
    if (failed) console.error(`[coworker-language] ${failed} of ${ids.length} coworkers kept their language in workspace ${workspaceId}`)
}
