import type { Database } from '@/app/api/database.types'
import { selectMany, type DbScope } from '@/lib/db'
import { LOCK_ARCHIVE_COLUMNS } from './lock'

export type SandboxArchive = Pick<Database['public']['Tables']['workspace_archives']['Row'], (typeof LOCK_ARCHIVE_COLUMNS)[number]>

// The archive a sandbox is put away in: its latest completed one. A row still `archiving`, or one
// that failed, never took the machine away and says nothing about the lock.
export async function loadSandboxArchive(scope: DbScope, workspaceId: number): Promise<SandboxArchive | null> {
    const { data } = await selectMany(scope, 'workspace_archives', LOCK_ARCHIVE_COLUMNS, { workspace_id: workspaceId, archived_at: { notNull: true } }, { column: 'archived_at', ascending: false }, 1)
    return data?.[0] ?? null
}
