import type { SubRunStatus, SubRunTask } from '@/lib/chat/sub-run-progress'

// The build's half of what apps/engine/src/tools/builtin/sub-run-watch.ts does for an agent: the
// live block of the team being built (build-team.ts). It is transposed rather than shared: apps/ui
// does not depend on apps/engine, and the block that reads this lives here. What is shared is the
// contract, `SubRunTask`, so the producer and the reader cannot drift without breaking the build.
export const SUB_RUN_HEARTBEAT_MS = 30_000

export type SubRunProgress = {
    title: string
    status: SubRunStatus
    steps: number
    activity?: string
    preview?: string
    startedAt?: number
    lastActivityAt?: number
    finishedAt?: number
    error?: string
}

// Idle time is computed here rather than by the reader: the browser clock drifts from the hub's, and
// a transcript replayed after a reload would otherwise date every part at the moment of the replay.
export function snapshotSubRun({ lastActivityAt, ...rest }: SubRunProgress): SubRunTask {
    return rest.status === 'running' && lastActivityAt !== undefined ? { ...rest, idleMs: Date.now() - lastActivityAt } : rest
}

export function beginSubRun(progress: SubRunProgress): void {
    progress.status = 'running'
    progress.startedAt = Date.now()
    progress.lastActivityAt = progress.startedAt
}

export function endSubRun(progress: SubRunProgress, error?: string): void {
    progress.status = error === undefined ? 'done' : 'error'
    progress.error = error
    progress.finishedAt = Date.now()
}

// While the build runs, the request is blocked inside one tool call and these parts are the only
// bytes travelling: the heartbeat is what keeps the response alive, not a refresh of the numbers.
export function startHeartbeat(emit: () => void): () => void {
    const timer = setInterval(emit, SUB_RUN_HEARTBEAT_MS)
    timer.unref?.()
    return () => clearInterval(timer)
}
