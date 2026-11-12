import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

process.env.LUMVIKA_DATA_DIR = mkdtempSync(resolve(tmpdir(), 'lumvika-assistant-'))

const { beforeAll, describe, expect, it } = await import('vitest')
const { writeFile } = await import('node:fs/promises')
const { ASSISTANT_AGENT_ID, TOOL_KEYS } = await import('@lumvika/contracts')
const { migrate } = await import('../db/migrate.js')
const { ensureAssistant } = await import('./assistant.js')
const { getAgent } = await import('./registry.js')
const { createAgent } = await import('./factory.js')
const { configPath } = await import('../config/paths.js')
const { listAgentIndex } = await import('../db/repos/agents.js')
const { buildTools } = await import('../tools/registry.js')
const { ASSISTANT_TOOL_NAMES } = await import('../tools/assistant.js')
const { buildSystemPrompt, systemPromptText } = await import('./systemPrompt.js')
const { createServer } = await import('../http/server.js')
const { logger } = await import('../lib/logger.js')

type LoadedAgent = Awaited<ReturnType<typeof getAgent>>

async function toolNames(agent: LoadedAgent, provider: 'lumvika' | 'claude' = 'lumvika') {
    const { tools, close } = await buildTools({ agent, sessionId: 's1', logger, provider, model: 'lumvika-max' })
    await close()
    return Object.keys(tools).sort()
}

beforeAll(async () => {
    await migrate()
    await ensureAssistant()
})

describe('assistant', () => {
    it('is written as the assistant, keeps nothing of its own and stays out of the agent index', async () => {
        const assistant = await getAgent(ASSISTANT_AGENT_ID)
        expect(assistant.config).toMatchObject({ kind: 'assistant', displayName: 'Assistant', model: null, mcpServers: [] })
        expect(assistant.config.selfImprovement).toEqual({ enabled: false, allowToolInstall: false, allowSoulEdit: false, autoMemory: false })
        expect(assistant.config.setup.required).toBe(false)
        expect(Object.entries(assistant.config.tools).filter(([, on]) => on).map(([key]) => key)).toEqual(['web', 'brain'])
        expect((await listAgentIndex()).map(agent => agent.id)).not.toContain(ASSISTANT_AGENT_ID)
    })

    it('is rewritten from code at boot, whatever was put in its folder', async () => {
        const assistant = await getAgent(ASSISTANT_AGENT_ID)
        await writeFile(configPath(ASSISTANT_AGENT_ID), JSON.stringify({ ...assistant.config, tools: { ...assistant.config.tools, shell: true, memory: true }, mcpServers: [{ name: 'evil', command: 'x' }] }), 'utf8')
        await ensureAssistant()
        const rewritten = await getAgent(ASSISTANT_AGENT_ID)
        expect(rewritten.config.tools.shell).toBe(false)
        expect(rewritten.config.tools.memory).toBe(false)
        expect(rewritten.config.mcpServers).toEqual([])
    })

    it('starts from a blank pin when its config cannot be read', async () => {
        await writeFile(configPath(ASSISTANT_AGENT_ID), 'not json', 'utf8')
        await ensureAssistant()
        expect((await getAgent(ASSISTANT_AGENT_ID)).config.model).toBeNull()
    })

    it('gets the web and the company brain read-only, nothing else', async () => {
        expect(await toolNames(await getAgent(ASSISTANT_AGENT_ID))).toEqual(['brain_read', 'brain_search', 'web_fetch', 'web_search'])
    })

    it('searches with the CLI subscription rather than a tool of its own', async () => {
        expect(await toolNames(await getAgent(ASSISTANT_AGENT_ID), 'claude')).toEqual(['brain_read', 'brain_search', 'web_fetch'])
    })

    // The allowlist is closed: every capability switched on, self-improvement, a pending setup and an
    // MCP server still give it the same four tools. A new tool family added to the registry fails here
    // only if it is wired past the assistant's early return.
    it('keeps the same allowlist with every capability switched on', async () => {
        const assistant = await getAgent(ASSISTANT_AGENT_ID)
        const everything: LoadedAgent = {
            ...assistant,
            install: 'Connect Gmail.',
            config: {
                ...assistant.config,
                tools: Object.fromEntries(TOOL_KEYS.map(key => [key, true])) as LoadedAgent['config']['tools'],
                selfImprovement: { enabled: true, allowToolInstall: true, allowSoulEdit: true, autoMemory: true },
                setup: { required: true, completedAt: null, sessionId: null },
                mcpServers: [{ name: 'files', command: 'echo', args: [], env: {}, headers: {} }],
            },
        }
        expect(await toolNames(everything)).toEqual([...ASSISTANT_TOOL_NAMES].sort())
    })

    it('never lets an agent be created as the assistant', async () => {
        const agent = await createAgent({ config: { name: 'impostor', kind: 'assistant' } as never })
        expect(agent.config.kind).toBe('user')
    })

    it('speaks as a general assistant, with the brain read-only and none of the agent sections', async () => {
        const prompt = systemPromptText(await buildSystemPrompt(await getAgent(ASSISTANT_AGENT_ID), { source: 'chat' }, 'lumvika'))
        expect(prompt).toContain('<role>')
        expect(prompt).toContain('You are not a coworker')
        expect(prompt).toContain('<company_brain>')
        expect(prompt).toContain('You cannot change the brain')
        expect(prompt).toContain('<language>')
        for (const absent of ['<bridged_tools>', '<project>', '<skills>', '<memory_index>', '<database>', '<shared_database>', '<environment>', '<asking_the_user>', '<service_catalog>', 'brain_write', 'shell_exec']) expect(prompt).not.toContain(absent)
    })

    it('reads the project of the conversation and the CLI bridge from the run', async () => {
        const assistant = await getAgent(ASSISTANT_AGENT_ID)
        const prompt = systemPromptText(await buildSystemPrompt({ ...assistant, assistantBrief: { project: { name: 'Launch', instructions: 'Ship small.' } } }, { source: 'chat' }, 'claude'))
        expect(prompt).toContain('<project>')
        expect(prompt).toContain('"Launch"')
        expect(prompt).toContain('Ship small.')
        expect(prompt).toContain('<bridged_tools>')
    })

    it('leaves the brain out of its prompt when the brain is off', async () => {
        const assistant = await getAgent(ASSISTANT_AGENT_ID)
        const prompt = systemPromptText(await buildSystemPrompt({ ...assistant, config: { ...assistant.config, tools: { ...assistant.config.tools, brain: false } } }, { source: 'chat' }, 'lumvika'))
        expect(prompt).not.toContain('<company_brain>')
    })
})

describe('assistant routes', () => {
    const app = createServer()
    const request = (method: string, path: string, body?: unknown) =>
        app.request(path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })

    it.each([
        ['GET', '/agents/assistant/sessions', undefined],
        ['GET', '/agents/assistant/sessions/s1', undefined],
        ['PATCH', '/agents/assistant', { description: 'hijacked' }],
        ['PATCH', '/agents/assistant', { model: 'lumvika-max', tools: { shell: true } }],
        ['PATCH', '/agents/assistant', ['model']],
        ['PATCH', '/agents/assistant/mcp-servers', { upsert: [] }],
        ['PATCH', '/agents/assistant/keys', { set: { A: 'b' } }],
        ['DELETE', '/agents/assistant', undefined],
        ['POST', '/agents/assistant/duplicate', { name: 'copy' }],
        ['GET', '/agents/assistant/archive', undefined],
        ['GET', '/agents/assistant/tools', undefined],
        ['GET', '/agents/assistant/files', undefined],
        ['PUT', '/agents/assistant/files/raw', undefined],
        ['GET', '/agents/assistant/memories', undefined],
        ['POST', '/agents/assistant/memories/recall', { query: 'x' }],
        ['GET', '/agents/assistant/skills', undefined],
        ['POST', '/agents/assistant/schedules', {}],
        ['POST', '/agents/assistant/triggers', {}],
        ['POST', '/agents/assistant/issue-runs', {}],
        ['GET', '/agents/assistant/data/tables', undefined],
        ['POST', '/agents/assistant/rewind', {}],
        ['GET', '/agents/assistant/runs/r1/steps', undefined],
        ['GET', '/agents/assistant/runs/r1/tools', undefined],
        ['POST', '/agents/assistant/runs/r1/tasks/t1/cancel', undefined],
    ])('refuses %s %s', async (method, path, body) => {
        expect((await request(method, path, body)).status).toBe(403)
    })

    it.each([
        ['GET', '/agents/assistant', 200],
        ['GET', '/agents/assistant/runs', 200],
        ['GET', '/agents/assistant/runs/r1', 404],
        ['GET', '/agents/assistant/runs/r1/stream', 204],
        ['GET', '/agents/assistant/sessions/s1/messages', 404],
    ])('lets the hub reach %s %s', async (method, path, status) => {
        expect((await request(method, path)).status).toBe(status)
    })

    it('lets the hub pin the workspace default model, and keeps the pin across a reboot', async () => {
        const pin = { connectionId: 'lumvika', provider: 'lumvika', model: 'lumvika-max' }
        expect((await request('PATCH', '/agents/assistant', pin)).status).toBe(200)
        await ensureAssistant()
        expect((await getAgent(ASSISTANT_AGENT_ID)).config).toMatchObject({ ...pin, kind: 'assistant' })
        expect((await request('PATCH', '/agents/assistant', { connectionId: null, provider: null, model: null })).status).toBe(200)
        expect((await getAgent(ASSISTANT_AGENT_ID)).config.model).toBeNull()
    })

    it('says it runs the assistant on /health', async () => {
        const health = (await (await request('GET', '/health')).json()) as { capabilities: string[] }
        expect(health.capabilities).toContain('assistant')
    })

    it('leaves the other agents alone', async () => {
        expect((await request('GET', '/agents/not-the-assistant')).status).not.toBe(403)
    })
})
