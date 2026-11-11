import type { SessionEntry, SessionStatus } from '@/lib/board/types'
import { selectMany, updateRows, type DbScope } from '@/lib/db'

const STALE_THRESHOLD_MS = 5 * 60 * 1000
// Bounds the batch handed to the engine, so a board full of long-running agents does not turn one
// load into a sweep of every session. The rest are swept on a later load.
const STALE_CHECK_LIMIT = 10

// A session missing from the store scores exactly like an idle one, so only the ones that carry a
// status are loaded: a workspace has thousands of finished sessions. Newest first and capped, so
// what falls off the end is always the oldest. null = query failed.
export async function fetchLiveSessions(scope: DbScope, agentIds: string[]): Promise<SessionEntry[] | null> {
    const { data } = await selectMany(scope, 'sessions', ['id', 'agent_id', 'origin_agent_id', 'status'] as const, { agent_id: agentIds, status: { neq: 'idle' } }, { column: 'updated_at', ascending: false }, 500)
    return data?.map(s => ({ id: s.id, agentId: s.agent_id, originAgentId: s.origin_agent_id, status: (s.status as SessionStatus) || 'idle' })) ?? null
}

// Flips to idle, in place and in the table, the `working` sessions the engine no longer runs.
// `idleAmong` answers which of the candidates the engine confirmed have no run in flight; one it
// could not ask stays out of that answer, and so stays working.
export async function sweepZombieSessions(scope: DbScope, sessions: SessionEntry[], idleAmong: (sessionIds: string[]) => Promise<string[]>): Promise<string[]> {
    const staleSessionIds = sessions.filter(s => s.status === 'working').map(s => s.id)
    if (staleSessionIds.length === 0) return []

    const now = Date.now()
    const { data: fullSessions } = await selectMany(scope, 'sessions', ['id', 'updated_at'] as const, { id: staleSessionIds })

    const candidates = (fullSessions ?? [])
        .filter(s => s.updated_at && now - new Date(s.updated_at).getTime() > STALE_THRESHOLD_MS)
        .slice(0, STALE_CHECK_LIMIT)
        .map(s => s.id)
    if (candidates.length === 0) return []

    // Silence is not proof a run is over: a legitimate long run writes nothing for an hour,
    // and marking it idle here used to hide it from the board while it was still working.
    // The engine is the only authority on that.
    const zombieIds = await idleAmong(candidates).catch((): string[] => [])
    if (zombieIds.length === 0) return []

    await updateRows(scope, 'sessions', { status: 'idle' }, { id: zombieIds })
    for (const s of sessions) {
        if (zombieIds.includes(s.id)) s.status = 'idle'
    }
    return zombieIds
}
