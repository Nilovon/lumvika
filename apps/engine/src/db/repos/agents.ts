import { eq } from 'drizzle-orm'
import { db } from '../client.js'
import { agents, type AgentRow } from '../schema.js'
import { nowIso } from '../../lib/ids.js'

export async function insertAgentIndex(id: string, name: string): Promise<void> {
    await db().insert(agents).values({ id, name, status: 'idle', createdAt: nowIso() })
}

export async function updateAgentIndex(id: string, name: string): Promise<void> {
    await db().update(agents).set({ name }).where(eq(agents.id, id))
}

export async function listAgentIndex(): Promise<AgentRow[]> {
    return db().select().from(agents)
}

export async function getAgentIndex(id: string): Promise<AgentRow | undefined> {
    const rows = await db().select().from(agents).where(eq(agents.id, id)).limit(1)
    return rows[0]
}

export async function setAgentStatus(id: string, status: string): Promise<void> {
    await db().update(agents).set({ status }).where(eq(agents.id, id))
}

export async function deleteAgentIndex(id: string): Promise<void> {
    await db().delete(agents).where(eq(agents.id, id))
}

export async function resetBusyAgents(): Promise<number> {
    const busy = await db().select({ id: agents.id }).from(agents).where(eq(agents.status, 'busy'))
    if (busy.length === 0) return 0
    await db().update(agents).set({ status: 'idle' }).where(eq(agents.status, 'busy'))
    return busy.length
}
