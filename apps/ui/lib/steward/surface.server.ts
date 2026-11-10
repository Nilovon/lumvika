import 'server-only'

import { ensureWorkspaceEngine, findWorkspaceEngine } from '@/app/api/_services/workspace-engine.service'
import { LUMVIKA_CLOUD } from '@lumvika/cloud/edition'
import type { StewardState } from './phase'
import { stewardSurface, type StewardSurface } from './surface'

// `canClaim` is false for an anonymous visitor: their workspace is thrown away with them, so it must
// never be the one the compose engine lands on.
export async function resolveStewardSurface(workspaceId: number, state: Pick<StewardState, 'phase'>, { canClaim }: { canClaim: boolean }): Promise<StewardSurface> {
    if (state.phase !== 'companion') return 'onboarding'
    return stewardSurface(state.phase, await hasEngine(workspaceId, canClaim))
}

// A self-hosted install hands its compose engine to the first thing that needs one, and a workspace
// that skipped the onboarding has nothing else to claim it: the steward is that first thing.
async function hasEngine(workspaceId: number, canClaim: boolean): Promise<boolean> {
    if (await findWorkspaceEngine(workspaceId)) return true
    if (LUMVIKA_CLOUD || !canClaim) return false
    const claimed = await ensureWorkspaceEngine(workspaceId).catch(err => {
        console.error(`[steward] failed to claim the compose engine for workspace ${workspaceId}`, err)
        return null
    })
    return !!claimed?.ok
}
