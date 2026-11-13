import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { vi } from 'vitest'

process.env.LUMVIKA_DATA_DIR = mkdtempSync(resolve(tmpdir(), 'lumvika-work-tools-'))
process.env.LUMVIKA_API_KEY = ''

const calls = vi.hoisted(() => [] as Array<{ agentId: string; tool: string; args: Record<string, unknown> }>)

vi.mock('../../runtime/hub.js', () => ({
    callHub: async (caller: { id: string }, tool: string, args: Record<string, unknown>) => {
        calls.push({ agentId: caller.id, tool, args })
        return { tool }
    },
}))

const { beforeEach, describe, expect, it } = await import('vitest')
const { WORK_TOOL_NAMES } = await import('@lumvika/contracts')
const { workTools } = await import('./work.js')

const tools = workTools({ agent: { id: 'writer' }, runId: 'run-1', sessionId: 'sess-1' } as any)
const unattached = workTools({ agent: { id: 'writer' } } as any)

function run(set: typeof tools, name: string, args: Record<string, unknown>) {
    const t = set[name] as any
    return t.execute(t.inputSchema.parse(args), { toolCallId: 'c', messages: [] })
}

beforeEach(() => {
    calls.length = 0
})

describe('workTools', () => {
    it('exposes exactly the work family', () => {
        expect(Object.keys(tools).sort()).toEqual([...WORK_TOOL_NAMES].sort())
    })

    it.each([
        ['work_create_issue', { title: 'Write the FAQ', parentRef: 'ENG-12', assignee: '@scout', priority: 'high' }],
        ['work_list_issues', { projectKey: 'ENG', status: ['todo'], assignee: 'me', limit: 5 }],
        ['work_list_projects', {}],
    ])('%s goes to the hub under its own name, as the calling coworker', async (name, args) => {
        expect(await run(tools, name, args)).toEqual({ tool: name })
        expect(calls).toEqual([{ agentId: 'writer', tool: name, args }])
    })

    it('hands the run and its conversation with every call about an issue, so the hub can tell it the issue was taken away', async () => {
        await run(tools, 'work_inbox', {})
        await run(tools, 'work_get_issue', { ref: 'ENG-12' })
        await run(tools, 'work_comment', { ref: 'ENG-12', body: 'Draft is in shared/launch.md' })
        await run(tools, 'work_checkout', { ref: 'ENG-12' })
        await run(tools, 'work_update_status', { ref: 'ENG-12', status: 'blocked', blockedReason: 'Anna must share the key' })
        expect(calls.map(call => call.tool)).toEqual(['work_inbox', 'work_get_issue', 'work_comment', 'work_checkout', 'work_update_status'])
        expect(calls.map(call => call.args)).toEqual([
            { runId: 'run-1', sessionId: 'sess-1' },
            { ref: 'ENG-12', runId: 'run-1', sessionId: 'sess-1' },
            { ref: 'ENG-12', body: 'Draft is in shared/launch.md', runId: 'run-1', sessionId: 'sess-1' },
            { ref: 'ENG-12', runId: 'run-1', sessionId: 'sess-1' },
            { ref: 'ENG-12', status: 'blocked', blockedReason: 'Anna must share the key', runId: 'run-1', sessionId: 'sess-1' },
        ])
    })

    it('sends null when the context carries no run', async () => {
        await run(unattached, 'work_checkout', { ref: 'ENG-12' })
        expect(calls[0].args).toEqual({ ref: 'ENG-12', runId: null, sessionId: null })
    })

    it('refuses what an agent may not set or forgets to name', () => {
        expect(() => (tools.work_update_status as any).inputSchema.parse({ ref: 'ENG-1', status: 'backlog' })).toThrow()
        expect(() => (tools.work_checkout as any).inputSchema.parse({})).toThrow()
        expect(() => (tools.work_comment as any).inputSchema.parse({ ref: 'ENG-1', body: '' })).toThrow()
        expect(() => (tools.work_create_issue as any).inputSchema.parse({ title: 'x', status: 'done' })).toThrow()
    })
})
