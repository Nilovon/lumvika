import type { Database } from '@/app/api/database.types'

type ArchiveStatus = Database['public']['Enums']['workspace_archive_status']

// Where a paying workspace's restore stands, as the banner tells it. `waiting` is a restore that
// could not land (no machine free, a failed job) and that the teardown will try again. `failed` is
// a restore that landed and whose canary refused the engine: the teardown leaves it to a human, so
// the banner must not promise it comes back on its own.
export type RestoreStage = 'machine' | 'data' | 'agents' | 'waiting' | 'failed'

export function restoreStageOf(archive: { status: ArchiveStatus; error_message: string | null } | null, hasMachine: boolean): RestoreStage {
    if (!archive) return 'machine'
    if (archive.status === 'restoring') return hasMachine ? 'data' : 'machine'
    // Restored but still flagged: the agents are being switched back on, unless the canary refused
    // the engine.
    if (archive.status === 'restored') return archive.error_message ? 'failed' : 'agents'
    if (archive.status === 'archived' && archive.error_message?.startsWith('Restore failed')) return 'waiting'
    return 'machine'
}
