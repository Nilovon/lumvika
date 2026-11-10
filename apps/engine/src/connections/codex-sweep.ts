import { existsSync } from 'node:fs'
import { readdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { forgetCodexThreadsOf } from '../agents/codex-threads.js'
import { codexHomeDir } from '../config/paths.js'
import { logger } from '../lib/logger.js'
import { activeRunCount } from '../runtime/run-control.js'
import { listConnectionIds } from './loader.js'
import { withConnectionLock } from './lock.js'

const SWEEP_INTERVAL_MS = 86_400_000

// A chat resumes its Codex thread from one message to the next, and forgets every thread of the
// connection before they go: the next message starts a new one from the full transcript. The exec
// transport writes a rollout per call, and the CLI's SQLite files only ever grow: a box reached 5 GB
// of them in six weeks.
const SESSION_DIRS = ['sessions', 'archived_sessions']

// By suffix rather than by name: the CLI versions its databases (`logs_2`, `state_5`) and renames
// them from one release to the next.
const SQLITE_FILE = /\.sqlite(-wal|-shm)?$/

let lastSweepAt = 0

// Sessions go first: a CLI that finds rollouts without its state database rebuilds it from them.
export async function sweepCodexHome(connectionId: string): Promise<void> {
    const home = codexHomeDir(connectionId)
    if (!existsSync(home)) return
    forgetCodexThreadsOf(connectionId)
    for (const dir of SESSION_DIRS) await rm(resolve(home, dir), { recursive: true, force: true })
    const entries = await readdir(home, { withFileTypes: true })
    for (const entry of entries) {
        if (entry.isFile() && SQLITE_FILE.test(entry.name)) await rm(resolve(home, entry.name), { force: true })
    }
}

// A busy box leaves `lastSweepAt` alone, so the sweep comes back on the next tick instead of
// waiting a day for another chance.
export async function sweepCodexHomesIfDue(): Promise<void> {
    const now = Date.now()
    if (now - lastSweepAt < SWEEP_INTERVAL_MS) return
    if (activeRunCount() > 0) return
    lastSweepAt = now
    for (const id of await listConnectionIds()) {
        await withConnectionLock(id, () => sweepCodexHome(id)).catch(err => logger.warn({ connection: id, err: String(err) }, 'codex home sweep failed'))
    }
}
