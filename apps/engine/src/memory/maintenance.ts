import { archiveMemoryFile } from './files.js'
import { computeStrength, ARCHIVE_THRESHOLD } from './decay.js'
import { listMemories, deleteMemory } from '../db/repos/memories.js'
import { logger } from '../lib/logger.js'

const SWEEP_INTERVAL_MS = 3_600_000

let lastSweepAt = 0

export async function sweepAgentMemories(agentId: string): Promise<number> {
    const rows = await listMemories(agentId)
    let archived = 0
    for (const row of rows) {
        if (computeStrength(row) >= ARCHIVE_THRESHOLD) continue
        try {
            await archiveMemoryFile(agentId, row.id)
            await deleteMemory(agentId, row.id)
            archived++
        } catch (err) {
            logger.warn({ agent: agentId, memory: row.id, err: String(err) }, 'memory archive failed')
        }
    }
    if (archived > 0) logger.info({ agent: agentId, archived }, 'archived decayed memories')
    return archived
}

export async function sweepMemoriesIfDue(agentIds: string[]): Promise<void> {
    const now = Date.now()
    if (now - lastSweepAt < SWEEP_INTERVAL_MS) return
    lastSweepAt = now
    for (const agentId of agentIds) {
        await sweepAgentMemories(agentId).catch(err => logger.error({ agent: agentId, err: String(err) }, 'memory sweep failed'))
    }
}
