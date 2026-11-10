import { tool, type ToolSet } from 'ai'
import { z } from 'zod'
import { recallMemory, updateMemory, deleteMemory } from '../../memory/store.js'
import { reconcileWrite } from '../../memory/reconcile.js'
import { memoryFileExists } from '../../memory/files.js'
import type { RunContext } from '../../runtime/context.js'

export function memoryTools(ctx: RunContext): ToolSet {
    return {
        memory_write: tool({
            description: 'Persist a durable fact or learning as a memory file. Use for things worth remembering across conversations. If what you learned is how to do something, it belongs in a skill, not here. A fact about the company itself (its offering, prices, customers, team, voice) belongs in the company brain, not here: brain_write when the user told you, brain_propose when you found it. Near-duplicate memories are reconciled automatically (an updated fact overwrites the one it supersedes). To target a specific memory, pass its id as updateId.',
            inputSchema: z.object({
                content: z.string().describe('The fact to remember, written so it is useful later'),
                kind: z.string().default('note').describe('Category, e.g. note, preference, fact, task'),
                tags: z.array(z.string()).default([]),
                updateId: z.string().optional().describe('Id of an existing memory to overwrite in place instead of creating a new one'),
            }),
            execute: async ({ content, kind, tags, updateId }) => {
                if (updateId && memoryFileExists(ctx.agent.id, updateId)) {
                    await updateMemory(ctx.agent, updateId, content)
                    return `Updated memory ${updateId}`
                }
                const res = await reconcileWrite(ctx.agent, content, kind, tags, { provider: ctx.provider, model: ctx.model })
                return res.updated ? `Updated memory ${res.id}` : `Saved memory ${res.id}`
            },
        }),
        memory_recall: tool({
            description: 'Search your memories by semantic + keyword relevance. Memories fade over time when unused: dormant (faded) ones are excluded unless includeDormant is true.',
            inputSchema: z.object({
                query: z.string(),
                limit: z.number().int().positive().max(20).default(5),
                includeDormant: z.boolean().default(false).describe('Also search dormant (faded) memories'),
            }),
            execute: async ({ query, limit, includeDormant }) => {
                const hits = await recallMemory(ctx.agent, query, limit, { includeDormant, reinforce: 'full' })
                if (hits.length === 0) return 'No relevant memories.'
                return hits.map(h => `- [${h.id}] (${h.kind}) ${h.content}`).join('\n')
            },
        }),
        memory_delete: tool({
            description: 'Delete a memory that is now wrong or obsolete. Get its id from memory_recall first.',
            inputSchema: z.object({ id: z.string() }),
            execute: async ({ id }) => {
                await deleteMemory(ctx.agent, id)
                return `Deleted memory ${id}`
            },
        }),
    }
}
