import { pendingClaudePlanLimits, refreshClaudePlanLimits } from './claude-plan-limits.js'
import { pendingCodexPlanLimits, refreshCodexPlanLimits } from './codex-plan-limits.js'
import { pendingOpencodePlanLimits, refreshOpencodePlanLimits } from './opencode-plan-limits.js'
import type { LoadedConnection } from './types.js'

// A refresh button pressed twice spawns one CLI, not two: inside the gap the second press waits for
// the read already under way, or answers with the reading it left.
export const FORCED_REFRESH_MIN_GAP_MS = 20_000
// Under the hub's own deadline for the call, so a CLI that hangs answers with the last reading.
export const FORCED_REFRESH_MAX_WAIT_MS = 25_000

const forcedAt = new Map<string, number>()

const READERS: Partial<Record<string, { read: (connection: LoadedConnection) => Promise<void>; pending: (id: string) => Promise<void> | undefined }>> = {
    claude: { read: refreshClaudePlanLimits, pending: pendingClaudePlanLimits },
    codex: { read: refreshCodexPlanLimits, pending: pendingCodexPlanLimits },
    opencode: { read: refreshOpencodePlanLimits, pending: pendingOpencodePlanLimits },
}

export async function refreshPlanLimitsNow(connection: LoadedConnection, now = Date.now()): Promise<void> {
    const reader = READERS[connection.config.provider]
    if (!reader) return
    const withinGap = now - (forcedAt.get(connection.id) ?? 0) < FORCED_REFRESH_MIN_GAP_MS
    if (!withinGap) forcedAt.set(connection.id, now)
    const task = withinGap ? reader.pending(connection.id) : reader.read(connection)
    if (!task) return
    let cap: NodeJS.Timeout | undefined
    await Promise.race([
        task,
        new Promise<void>(resolve => {
            cap = setTimeout(resolve, FORCED_REFRESH_MAX_WAIT_MS)
        }),
    ])
    clearTimeout(cap)
}
