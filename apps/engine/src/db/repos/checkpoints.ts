import { desc, eq } from 'drizzle-orm'
import type { ModelMessage } from 'ai'
import { getSystemDb } from '../systemDb.js'
import { compactionCheckpoints, type CompactionCheckpointRow } from '../schema.js'
import { newId, nowIso } from '../../lib/ids.js'

export async function getLatestCheckpoint(agentId: string, sessionId: string): Promise<CompactionCheckpointRow | null> {
    const { db } = await getSystemDb(agentId)
    const rows = await db.select().from(compactionCheckpoints).where(eq(compactionCheckpoints.sessionId, sessionId)).orderBy(desc(compactionCheckpoints.createdAt)).limit(1)
    return rows[0] ?? null
}

export type SaveCheckpointInput = { summaryMessage: ModelMessage; throughMessageId: string; throughCreatedAt: string }

export async function saveCheckpoint(agentId: string, sessionId: string, input: SaveCheckpointInput): Promise<CompactionCheckpointRow> {
    const row: CompactionCheckpointRow = {
        id: newId(),
        sessionId,
        summaryJson: JSON.stringify(input.summaryMessage),
        throughMessageId: input.throughMessageId,
        throughCreatedAt: input.throughCreatedAt,
        createdAt: nowIso(),
    }
    const { db } = await getSystemDb(agentId)
    await db.insert(compactionCheckpoints).values(row)
    return row
}
