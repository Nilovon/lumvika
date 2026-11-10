import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { boxDefaultModelSchema, type BoxDefaultModel } from '@rerun/contracts'
import { boxDefaultPath, connectionsDir } from '../config/paths.js'
import { clearAgentCache } from '../agents/registry.js'

// Read once and held: the engine is a single process, and every write to the file goes through
// this module, so there is no other writer to miss.
let cached: BoxDefaultModel | null | undefined

export async function readBoxDefault(): Promise<BoxDefaultModel | null> {
    if (cached !== undefined) return cached
    const path = boxDefaultPath()
    if (!existsSync(path)) return (cached = null)
    try {
        cached = boxDefaultModelSchema.parse(JSON.parse(await readFile(path, 'utf8')))
    } catch {
        // A file we cannot read is not a reason to take every default agent down: the resolution
        // ladder falls through to Rerun exactly as it does on a box that never set one.
        cached = null
    }
    return cached
}

// Dropping every cached agent is what `unloadConnection` does for the same reason: each one holds a
// pair resolved against the old default. A run already in flight keeps its own, captured in locals
// before the first step, so nothing switches models mid-turn.
async function commit(next: BoxDefaultModel | null): Promise<void> {
    cached = next
    clearAgentCache()
}

export async function writeBoxDefault(next: BoxDefaultModel): Promise<BoxDefaultModel> {
    await mkdir(connectionsDir(), { recursive: true })
    const target = boxDefaultPath()
    const tmp = `${target}.tmp`
    await writeFile(tmp, `${JSON.stringify(next, null, 4)}\n`, 'utf8')
    await rename(tmp, target)
    await commit(next)
    return next
}

export async function clearBoxDefault(): Promise<void> {
    await rm(boxDefaultPath(), { force: true })
    await commit(null)
}
