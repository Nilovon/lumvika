export type ArchiveRowLike = { workspace_id: number; archived_at: string | null }

/**
 * The archive each workspace is paused on: its latest completed one. A workspace paused, restored
 * and paused again keeps the older row, and that row's expiry says nothing about the current pause.
 */
export function latestCompletedArchives<T extends ArchiveRowLike>(rows: T[]): Map<number, T> {
    const latest = new Map<number, T>()
    for (const row of rows) {
        if (!row.archived_at) continue
        const known = latest.get(row.workspace_id)
        if (!known || Date.parse(row.archived_at) > Date.parse(known.archived_at as string)) latest.set(row.workspace_id, row)
    }
    return latest
}
