import 'server-only'

import { ENGINE_CAPABILITY_ISSUE_RUNS } from '@lumvika/contracts'

import { findWorkspaceEngine } from '@/app/api/_services/workspace-engine.service'
import { getEngineHealth } from '@/lib/engine/client'

// Whether the workspace's engine can run coworkers on issues. An engine updates on its own schedule:
// one older than issue runs takes an assignment without ever waking the coworker, so the screens
// where a person assigns one say so instead of letting it look like it works.
export type IssueRunsReadiness = 'ready' | 'outdated' | 'no_engine' | 'unreachable'

export async function issueRunsReadiness(workspaceId: number): Promise<IssueRunsReadiness> {
    const engine = await findWorkspaceEngine(workspaceId)
    if (!engine) return 'no_engine'
    try {
        const health = await getEngineHealth(engine.conn)
        return health.capabilities.includes(ENGINE_CAPABILITY_ISSUE_RUNS) ? 'ready' : 'outdated'
    } catch {
        return 'unreachable'
    }
}
