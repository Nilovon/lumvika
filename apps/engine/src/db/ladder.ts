import type { Client } from '@libsql/client'
import { logger } from '../lib/logger.js'

// One schema change of one SQLite file. A shipped step is never edited nor removed: a file sitting
// at its version never runs it again, and an archive taken before it still needs it. `up` must be
// re-runnable, because a crash between the step and the version write replays it.
export type SqliteMigration = { version: number; id: string; up: (client: Client) => Promise<void> }

export const latestVersion = (steps: { version: number }[]): number => steps.at(-1)?.version ?? 0

export async function sqliteVersion(client: Client): Promise<number> {
    const rs = await client.execute('PRAGMA user_version')
    return Number(rs.rows[0]?.user_version ?? 0)
}

export async function migrateSqlite(client: Client, steps: SqliteMigration[], file: string): Promise<void> {
    const current = await sqliteVersion(client)
    const target = latestVersion(steps)
    // An engine rolled back over a file a newer build already migrated. Refusing to open it would take
    // the agent down on a plain revert, and every step so far only adds.
    if (current > target) {
        logger.warn({ file, current, target }, 'sqlite file is newer than this engine, leaving it as is')
        return
    }
    for (const step of steps) {
        if (step.version <= current) continue
        await step.up(client)
        await client.execute(`PRAGMA user_version = ${step.version}`)
    }
}
