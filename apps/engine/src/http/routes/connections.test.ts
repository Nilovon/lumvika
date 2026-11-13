import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

process.env.LUMVIKA_DATA_DIR = mkdtempSync(resolve(tmpdir(), 'lumvika-cxroutes-'))

const { beforeEach, describe, expect, it, vi } = await import('vitest')

// The Codex app-server session the connect waits for, answered from what the test posed.
const codexCli = vi.hoisted(() => ({ models: [] as string[] }))
// A plan-limits read a run's end left under way, as the test poses it, keyed by connection.
const pendingReads = vi.hoisted(() => new Map<string, Promise<void>>())
vi.mock('../../connections/codex-plan-limits.js', async () => {
    const { recordCliModels } = await import('../../connections/cli-models.js')
    return {
        refreshCodexPlanLimits: async (connection: { id: string } | null) => {
            if (connection) recordCliModels(connection.id, codexCli.models, '0.166.0', false)
        },
        refreshStaleCodexPlanLimits: () => {},
        pendingCodexPlanLimits: (id: string) => pendingReads.get(id),
    }
})
// OpenCode's live catalog, as the test poses it: null until a reading lands, like on a fresh box.
const opencodeLive = vi.hoisted(() => ({ models: null as string[] | null, refreshed: 0 }))
vi.mock('../../connections/opencode-catalog.js', async importOriginal => {
    const actual = await importOriginal<typeof import('../../connections/opencode-catalog.js')>()
    return {
        ...actual,
        refreshOpencodeCatalog: async () => {
            opencodeLive.refreshed += 1
        },
        refreshStaleOpencodeCatalog: () => {},
        liveOpencodeProviderModels: () => (opencodeLive.models ? actual.opencodeProviderModels().filter(model => opencodeLive.models!.includes(model.id)) : null),
    }
})
vi.mock('../../connections/opencode-plan-limits.js', () => ({ refreshOpencodePlanLimits: async () => {}, refreshStaleOpencodePlanLimits: () => {}, forgetOpencodePlanLimitsAttempt: () => {}, pendingOpencodePlanLimits: () => undefined }))
// The Claude usage probe spawns the CLI: the routes only see what it records, as the test poses it.
const claudeProbes = vi.hoisted(() => ({ stale: 0, forced: [] as string[] }))
vi.mock('../../connections/claude-plan-limits.js', async () => {
    const { recordPlanLimitsReading } = await import('../../connections/plan-limits.js')
    return {
        refreshClaudePlanLimits: async (connection: { id: string } | null) => {
            if (!connection) return
            claudeProbes.forced.push(connection.id)
            recordPlanLimitsReading(connection.id, {
                windows: [
                    { id: 'five_hour', kind: 'session', label: null, usedPercent: 31, resetsAt: '2026-11-13T18:00:00.000Z', windowDurationMins: 300 },
                    { id: 'seven_day_fable', kind: 'model', label: 'Fable', usedPercent: 12, resetsAt: '2026-11-18T08:00:00.000Z', windowDurationMins: 10080 },
                ],
                plan: 'max',
                extraUsage: { enabled: true, usedPercent: 40, zeroCap: false },
            })
        },
        refreshStaleClaudePlanLimits: () => {
            claudeProbes.stale += 1
        },
        pendingClaudePlanLimits: () => undefined,
        forgetClaudePlanLimitsAttempt: () => {},
    }
})
const { mkdir, readFile, rm, writeFile } = await import('node:fs/promises')
const { DEFAULT_CONNECTION_MODELS, LUMVIKA_CONNECTION_ID } = await import('@lumvika/contracts')
const { connectionRoutes } = await import('./connections.js')
const { createServer } = await import('../server.js')
const { agentDir, agentsDir, boxDefaultPath, configPath, connectionConfigPath, connectionEnvPath, connectionsDir, scheduleFile, schedulesDir } = await import('../../config/paths.js')
const { readEnvFile } = await import('../../lib/env-file.js')
const { ensureLumvikaConnection } = await import('../../connections/store.js')
const { unloadConnection } = await import('../../connections/registry.js')
const { clearBoxDefault, readBoxDefault } = await import('../../connections/default.js')
const { readSchedule } = await import('../../schedules/loader.js')

type Summary = { id: string; name: string; provider: string; models: string[]; connected: boolean }

async function post(path: string, body: unknown) {
    return connectionRoutes.request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
}

async function patch(path: string, body: unknown) {
    return connectionRoutes.request(path, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
}

async function put(path: string, body: unknown) {
    return connectionRoutes.request(path, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
}

async function createClaude(name = 'Claude Clement'): Promise<Summary> {
    const res = await post('/', { name, provider: 'claude', models: ['opus', 'sonnet'], keys: { CLAUDE_CODE_OAUTH_TOKEN: 'sk-ant-oat-secret' } })
    return (await res.json()) as Summary
}

async function writeAgent(id: string, pair: { connectionId: string | null; provider: string | null; model: string | null }): Promise<void> {
    await mkdir(agentDir(id), { recursive: true })
    await writeFile(configPath(id), JSON.stringify({ name: id, description: '', ...pair, tools: {}, mcpServers: [], selfImprovement: {} }), 'utf8')
}

async function readAgent(id: string): Promise<Record<string, unknown>> {
    return JSON.parse(await readFile(configPath(id), 'utf8')) as Record<string, unknown>
}

async function writeScheduleFile(agentId: string, slug: string, front: Record<string, unknown>): Promise<void> {
    await mkdir(schedulesDir(agentId), { recursive: true })
    const yaml = Object.entries(front)
        .map(([key, value]) => `${key}: ${value === null ? 'null' : String(value)}`)
        .join('\n')
    await writeFile(scheduleFile(agentId, slug), `---\n${yaml}\n---\n\nDo the thing.\n`, 'utf8')
}

beforeEach(async () => {
    codexCli.models = []
    opencodeLive.models = null
    opencodeLive.refreshed = 0
    unloadConnection(LUMVIKA_CONNECTION_ID)
    await clearBoxDefault()
    await rm(connectionsDir(), { recursive: true, force: true })
    await rm(agentsDir(), { recursive: true, force: true })
    await ensureLumvikaConnection()
})

describe('connections API', () => {
    it('creates a connection and never returns its credential', async () => {
        const created = await createClaude()
        expect(created.provider).toBe('claude')
        expect(created.connected).toBe(true)
        expect(JSON.stringify(created)).not.toContain('sk-ant-oat-secret')

        expect(Object.keys(await readEnvFile(connectionEnvPath(created.id)))).toEqual(['CLAUDE_CODE_OAUTH_TOKEN'])
    })

    it('reports a connection with no credential as not connected', async () => {
        const res = await post('/', { name: 'Empty', provider: 'anthropic', models: ['claude-opus-4-8'] })
        expect(((await res.json()) as Summary).connected).toBe(false)
    })

    it('renames and re-curates the models', async () => {
        const created = await createClaude()
        const updated = (await (await patch(`/${created.id}`, { name: 'Team plan', models: ['sonnet'] })).json()) as Summary
        expect(updated.name).toBe('Team plan')
        expect(updated.models).toEqual(['sonnet'])
    })

    // Two connections of the same provider is the whole point: one Claude subscription per person.
    it('allows several connections of one provider', async () => {
        await createClaude('Claude Clement')
        await createClaude('Claude Theo')
        const { connections } = (await (await connectionRoutes.request('/')).json()) as { connections: Summary[] }
        expect(connections.filter(c => c.provider === 'claude')).toHaveLength(2)
    })

    // Deleting a credential the user no longer has is not something to refuse: everything pointing
    // at it goes back to `null`, which is what "follow the Box default" is spelled as on disk.
    it('releases the agents pointing at a deleted connection onto the box default', async () => {
        const created = await createClaude()
        await writeAgent('bound', { connectionId: created.id, provider: 'claude', model: 'opus' })

        const res = await connectionRoutes.request(`/${created.id}`, { method: 'DELETE' })
        expect(res.status).toBe(200)
        const body = (await res.json()) as { deleted: string; released: { agents: { id: string }[] } }
        expect(body.released.agents.map(a => a.id)).toEqual(['bound'])
        expect(await readAgent('bound')).toMatchObject({ connectionId: null, provider: null, model: null })
    })

    it('releases the automations of every agent, at their own slug', async () => {
        const created = await createClaude()
        await writeAgent('owner', { connectionId: null, provider: null, model: null })
        // Renamed since its creation, so its file no longer sits at `slugify(name)`: writing through
        // `writeSchedule` would leave this one behind, still pinned.
        await writeScheduleFile('owner', 'old-slug', { name: 'Renamed digest', connection: created.id, model: 'opus' })

        const res = await connectionRoutes.request(`/${created.id}`, { method: 'DELETE' })
        expect(res.status).toBe(200)
        const body = (await res.json()) as { released: { automations: { agentId: string; kind: string; slug: string }[] } }
        expect(body.released.automations).toEqual([{ agentId: 'owner', kind: 'schedule', slug: 'old-slug' }])
        const schedule = await readSchedule('owner', 'old-slug')
        expect(schedule.connectionId).toBeNull()
        expect(schedule.model).toBeNull()
    })

    // The pointer changes nothing for an agent that named no model, but leaving it behind would
    // dangle at an id no connection answers to.
    it('clears a stale connectionId sitting next to a null model without reporting it', async () => {
        const created = await createClaude()
        await writeAgent('leftover', { connectionId: created.id, provider: 'claude', model: null })

        const res = await connectionRoutes.request(`/${created.id}`, { method: 'DELETE' })
        const body = (await res.json()) as { released: { agents: unknown[] } }
        expect(body.released.agents).toEqual([])
        expect(await readAgent('leftover')).toMatchObject({ connectionId: null, provider: null, model: null })
    })

    it('deletes a connection nothing points at', async () => {
        const created = await createClaude()
        expect((await connectionRoutes.request(`/${created.id}`, { method: 'DELETE' })).status).toBe(200)
        const { connections } = (await (await connectionRoutes.request('/')).json()) as { connections: Summary[] }
        expect(connections.map(c => c.id)).not.toContain(created.id)
    })

    // The keyless Lumvika connection is the last-resort fallback for every agent on the box, so it is
    // not something a user can rename away or remove. Routed through the full server: the refusal
    // is an HttpError, and only the app-level handler turns it into a 400.
    it('protects the Lumvika connection', async () => {
        const app = createServer()
        const json = { 'content-type': 'application/json' }
        expect((await app.request(`/connections/${LUMVIKA_CONNECTION_ID}`, { method: 'DELETE' })).status).toBe(400)
        expect((await app.request(`/connections/${LUMVIKA_CONNECTION_ID}`, { method: 'PATCH', headers: json, body: JSON.stringify({ name: 'Free stuff' }) })).status).toBe(400)
        expect((await app.request(`/connections/${LUMVIKA_CONNECTION_ID}`, { method: 'PATCH', headers: json, body: JSON.stringify({ models: ['lumvika-max'] }) })).status).toBe(200)
        expect((await app.request(`/connections/${LUMVIKA_CONNECTION_ID}`, { method: 'PATCH', headers: json, body: JSON.stringify({ models: [] }) })).status).toBe(400)
    })

    it('switches the Lumvika models back on at boot on a box where they were off', async () => {
        await writeFile(connectionConfigPath(LUMVIKA_CONNECTION_ID), JSON.stringify({ name: 'Lumvika', provider: 'lumvika', models: [], extraModels: [], createdAt: new Date().toISOString() }), 'utf8')
        unloadConnection(LUMVIKA_CONNECTION_ID)
        await ensureLumvikaConnection()
        const { connections } = (await (await connectionRoutes.request('/')).json()) as { connections: Summary[] }
        expect(connections.find(c => c.id === LUMVIKA_CONNECTION_ID)?.models).toEqual(['lumvika-max', 'lumvika-fast', 'lumvika-smart'])
    })
})

describe('box default model', () => {
    it('answers null on a box nobody configured', async () => {
        const body = (await (await connectionRoutes.request('/')).json()) as { default: unknown }
        expect(body.default).toBeNull()
    })

    it('sets the pair and echoes it on the next list', async () => {
        const created = await createClaude()
        expect((await put('/default', { connectionId: created.id, model: 'opus' })).status).toBe(200)
        const body = (await (await connectionRoutes.request('/')).json()) as { default: { connectionId: string; model: string } }
        expect(body.default).toEqual({ connectionId: created.id, model: 'opus' })
    })

    // `/default` is registered before `/:id`, so it must not be read as a connection id.
    it('does not fall through to the connection routes', async () => {
        expect((await put('/default', { connectionId: 'nope', model: 'opus' })).status).toBe(404)
    })

    it('refuses a model the connection does not offer', async () => {
        const created = await createClaude()
        expect((await put('/default', { connectionId: created.id, model: 'haiku' })).status).toBe(400)
    })

    it('clears the default when the connection holding it is deleted', async () => {
        const created = await createClaude()
        await put('/default', { connectionId: created.id, model: 'opus' })
        const res = await connectionRoutes.request(`/${created.id}`, { method: 'DELETE' })
        expect(res.status).toBe(200)
        expect(((await res.json()) as { released: { isBoxDefault: boolean } }).released.isBoxDefault).toBe(true)
        expect(await readBoxDefault()).toBeNull()
    })

    // Switching the model off in the Connections tab is the one write that can see the default go
    // stale, so it repairs it rather than leaving every box-default agent to drop to Lumvika.
    it('repairs the default when its model is switched off', async () => {
        const created = await createClaude()
        await put('/default', { connectionId: created.id, model: 'opus' })
        await patch(`/${created.id}`, { models: ['sonnet'] })
        expect(await readBoxDefault()).toEqual({ connectionId: created.id, model: 'sonnet' })
    })

    // Plugging the first credential is the whole setup: without this it would land on a box that
    // keeps every agent on Lumvika until someone finds the star.
    it('adopts the first connected connection', async () => {
        const created = await createClaude()
        expect(await readBoxDefault()).toEqual({ connectionId: created.id, model: 'opus' })
    })

    // The top model of a family is not in every plan: a box adopting it on connect failed its first
    // run with "Fable 5.1 requires usage credits". A plugged subscription starts one step below.
    it.each([
        ['claude', 'claude-opus-5-5', { CLAUDE_CODE_OAUTH_TOKEN: 'sk-ant-oat-secret' }],
        ['codex', 'gpt-6-sol', { CODEX_OAUTH_TOKEN: 'codex-secret' }],
    ] as const)('adopts a %s subscription one step below the top tier', async (provider, model, keys) => {
        const res = await post('/', { name: provider, provider, models: DEFAULT_CONNECTION_MODELS[provider], keys })
        const created = (await res.json()) as Summary
        expect(await readBoxDefault()).toEqual({ connectionId: created.id, model })
    })

    // The reading is taken against the credential that just arrived, before the default is written:
    // a box must never adopt a model the account's Codex refuses.
    it("adopts the first model the account's Codex serves", async () => {
        codexCli.models = ['gpt-6-luna', 'gpt-5.6-sol']
        const res = await post('/', { name: 'codex', provider: 'codex', models: DEFAULT_CONNECTION_MODELS.codex, keys: { CODEX_OAUTH_TOKEN: 'codex-secret' } })
        const created = (await res.json()) as Summary
        expect(await readBoxDefault()).toEqual({ connectionId: created.id, model: 'gpt-6-luna' })
    })

    // A star written before the box knew what the plan serves (every box connected before #1613).
    it('lists a default moved off a model the account refuses', async () => {
        codexCli.models = ['gpt-6-luna', 'gpt-5.6-terra']
        const created = (await (await post('/', { name: 'codex', provider: 'codex', models: DEFAULT_CONNECTION_MODELS.codex, keys: { CODEX_OAUTH_TOKEN: 'codex-secret' } })).json()) as Summary
        expect((await put('/default', { connectionId: created.id, model: 'gpt-6-sol' })).status).toBe(200)
        const listed = (await (await connectionRoutes.request('/')).json()) as { default: unknown }
        expect(listed.default).toEqual({ connectionId: created.id, model: 'gpt-6-luna' })
        expect(await readBoxDefault()).toEqual({ connectionId: created.id, model: 'gpt-6-luna' })
    })

    // Two lists repairing at once collide on the same temp file: the one that loses still lists.
    it('still lists when the repair of the default cannot write', async () => {
        codexCli.models = ['gpt-6-luna', 'gpt-5.6-terra']
        const created = (await (await post('/', { name: 'codex', provider: 'codex', models: DEFAULT_CONNECTION_MODELS.codex, keys: { CODEX_OAUTH_TOKEN: 'codex-secret' } })).json()) as Summary
        await put('/default', { connectionId: created.id, model: 'gpt-6-sol' })
        await mkdir(`${boxDefaultPath()}.tmp`)
        const res = await connectionRoutes.request('/')
        expect(res.status).toBe(200)
        expect(((await res.json()) as { default: unknown }).default).toEqual({ connectionId: created.id, model: 'gpt-6-sol' })
    })

    it('adopts DeepSeek V4 Pro on a fresh OpenCode connection, after reading the catalog', async () => {
        const res = await post('/', { name: 'OpenCode', provider: 'opencode', models: DEFAULT_CONNECTION_MODELS.opencode, keys: { OPENCODE_API_KEY: 'oc_sk_secret' } })
        const created = (await res.json()) as Summary & { providerModels: { id: string }[] | null }
        expect(res.status).toBe(201)
        expect(created.connected).toBe(true)
        expect(JSON.stringify(created)).not.toContain('oc_sk_secret')
        expect(created.providerModels?.some(model => model.id === 'console/claude-sonnet-5-5')).toBe(true)
        expect(opencodeLive.refreshed).toBe(1)
        expect(await readBoxDefault()).toEqual({ connectionId: created.id, model: 'go/deepseek-v4-pro' })
    })

    // A model OpenCode stopped publishing is never the one a box adopts.
    it('adopts the first model OpenCode still serves', async () => {
        opencodeLive.models = DEFAULT_CONNECTION_MODELS.opencode.filter(id => id !== 'go/deepseek-v4-pro')
        const res = await post('/', { name: 'OpenCode', provider: 'opencode', models: DEFAULT_CONNECTION_MODELS.opencode, keys: { OPENCODE_API_KEY: 'oc_sk_secret' } })
        const created = (await res.json()) as Summary
        expect(await readBoxDefault()).toEqual({ connectionId: created.id, model: DEFAULT_CONNECTION_MODELS.opencode[1] })
    })

    it('reads the Codex models again when the credential arrives after the connection', async () => {
        const created = (await (await post('/', { name: 'codex', provider: 'codex', models: DEFAULT_CONNECTION_MODELS.codex })).json()) as Summary
        expect(await readBoxDefault()).toBeNull()
        codexCli.models = ['gpt-6-luna']
        await patch(`/${created.id}/keys`, { set: { CODEX_OAUTH_TOKEN: 'codex-secret' } })
        expect(await readBoxDefault()).toEqual({ connectionId: created.id, model: 'gpt-6-luna' })
    })

    it('leaves a default already set alone', async () => {
        const first = await createClaude('Claude Clement')
        await createClaude('Claude Theo')
        expect(await readBoxDefault()).toEqual({ connectionId: first.id, model: 'opus' })
    })

    it('does not adopt a connection with no credential', async () => {
        await post('/', { name: 'Empty', provider: 'anthropic', models: ['claude-opus-4-8'] })
        expect(await readBoxDefault()).toBeNull()
    })

    // Moving the default onto a connection plugged in next to a working one would move the bill
    // without anyone asking, so the adoption only fires while nothing else is connected.
    it('does not adopt while another connection is already plugged in', async () => {
        await createClaude('Claude Clement')
        await connectionRoutes.request('/default', { method: 'DELETE' })
        await createClaude('Claude Theo')
        expect(await readBoxDefault()).toBeNull()
    })

    it('adopts when the credential arrives after the connection', async () => {
        const created = (await (await post('/', { name: 'Empty', provider: 'anthropic', models: ['claude-opus-4-8'] })).json()) as Summary
        expect(await readBoxDefault()).toBeNull()
        await patch(`/${created.id}/keys`, { set: { ANTHROPIC_API_KEY: 'sk-ant-secret' } })
        expect(await readBoxDefault()).toEqual({ connectionId: created.id, model: 'claude-opus-4-8' })
    })

    // `defaultModelOf` falls back to the provider default here, which is a pair the connection does
    // not serve: starring it would show nowhere.
    it('does not adopt a connection offering no model', async () => {
        await post('/', { name: 'Bare', provider: 'claude', models: [], keys: { CLAUDE_CODE_OAUTH_TOKEN: 'sk-ant-oat-secret' } })
        expect(await readBoxDefault()).toBeNull()
    })

    it('clears back to nothing', async () => {
        const created = await createClaude()
        await put('/default', { connectionId: created.id, model: 'opus' })
        expect((await connectionRoutes.request('/default', { method: 'DELETE' })).status).toBe(200)
        expect(await readBoxDefault()).toBeNull()
    })
})

describe('plan limits on the list', () => {
    const windows = [{ kind: 'session' as const, label: null, usedPercent: 42, resetsAt: '2026-10-05T15:00:00.000Z' }]

    async function planLimitsOf(id: string): Promise<unknown> {
        const res = await connectionRoutes.request('/')
        const { connections } = (await res.json()) as { connections: (Summary & { planLimits: unknown })[] }
        return connections.find(c => c.id === id)?.planLimits
    }

    it('carries the last reading of a plan, and null before any', async () => {
        const { recordPlanLimits } = await import('../../connections/plan-limits.js')
        const claude = await createClaude()
        expect(await planLimitsOf(claude.id)).toBeNull()

        recordPlanLimits(claude.id, windows)
        expect(await planLimitsOf(claude.id)).toMatchObject({ windows })
    })

    it('survives a config patch but not a change of credential', async () => {
        const { recordPlanLimits } = await import('../../connections/plan-limits.js')
        const claude = await createClaude()
        recordPlanLimits(claude.id, windows)

        await patch(`/${claude.id}`, { models: ['opus'] })
        expect(await planLimitsOf(claude.id)).toMatchObject({ windows })

        await patch(`/${claude.id}/keys`, { set: { CLAUDE_CODE_OAUTH_TOKEN: 'sk-ant-oat-another-account' } })
        expect(await planLimitsOf(claude.id)).toBeNull()
    })

    it('waits for the read a run left under way, so the list carries it', async () => {
        const { recordPlanLimits } = await import('../../connections/plan-limits.js')
        const claude = await createClaude()
        pendingReads.set(
            claude.id,
            new Promise<void>(resolve =>
                setTimeout(() => {
                    recordPlanLimits(claude.id, windows)
                    resolve()
                }, 20)
            )
        )
        try {
            expect(await planLimitsOf(claude.id)).toMatchObject({ windows })
        } finally {
            pendingReads.delete(claude.id)
        }
    })

    it('answers with the reading it has when that read hangs', async () => {
        const claude = await createClaude()
        pendingReads.set(claude.id, new Promise<void>(() => {}))
        // Only the cap is faked: the list reads the data-dir on the way, which needs the real loop.
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
        try {
            let answered = false
            const listed = planLimitsOf(claude.id).finally(() => {
                answered = true
            })
            for (let tick = 0; tick < 20 && !answered; tick += 1) {
                await new Promise<void>(resolve => setImmediate(resolve))
                await vi.advanceTimersByTimeAsync(1_000)
            }
            expect(await listed).toBeNull()
        } finally {
            pendingReads.delete(claude.id)
            vi.useRealTimers()
        }
    })
})

describe('plan limits of one subscription', () => {
    it('reads a subscription again when asked, and paces a second ask', async () => {
        const claude = await createClaude()
        claudeProbes.forced = []

        const first = await connectionRoutes.request(`/${claude.id}/plan-limits?refresh=1`)
        expect(first.status).toBe(200)
        const body = (await first.json()) as { connectionId: string; planLimits: { windows: { id: string }[]; plan: string; extraUsage: unknown } }
        expect(body.connectionId).toBe(claude.id)
        expect(body.planLimits.windows.map(window => window.id)).toEqual(['five_hour', 'seven_day_fable'])
        expect(body.planLimits).toMatchObject({ plan: 'max', extraUsage: { enabled: true, usedPercent: 40 } })

        await connectionRoutes.request(`/${claude.id}/plan-limits?refresh=1`)
        expect(claudeProbes.forced).toEqual([claude.id])
    })

    it('answers with the reading it holds without spawning anything', async () => {
        const claude = await createClaude()
        claudeProbes.forced = []
        const res = await connectionRoutes.request(`/${claude.id}/plan-limits`)
        expect(await res.json()).toEqual({ connectionId: claude.id, planLimits: null })
        expect(claudeProbes.forced).toEqual([])
    })

    it('answers 404 for a connection that does not exist', async () => {
        expect((await connectionRoutes.request('/ghost/plan-limits?refresh=1')).status).toBe(404)
    })

    it('kicks the stale Claude reads off the list, without waiting for them', async () => {
        await createClaude()
        const before = claudeProbes.stale
        await connectionRoutes.request('/')
        expect(claudeProbes.stale).toBe(before + 1)
    })
})

describe('token usage', () => {
    type Usage = { inputTokens: number; outputTokens: number; cachedInputTokens: number }

    async function finishedRun(agentId: string, id: string, provider: string, usage: Usage, cacheWriteTokens: number): Promise<void> {
        const { finishRun, setRunContext, startRun } = await import('../../db/repos/runs.js')
        const { insertRunStep } = await import('../../db/repos/telemetry.js')
        await startRun(agentId, 's1', id)
        await setRunContext(agentId, id, { provider, model: 'm', triggerSource: 'chat', triggerSlug: null })
        await insertRunStep(agentId, {
            id: `${id}-step`,
            runId: id,
            agentId,
            sessionId: 's1',
            stepNumber: 1,
            provider,
            model: 'm',
            finishReason: 'stop',
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            cachedInputTokens: usage.cachedInputTokens,
            reasoningTokens: null,
            totalTokens: null,
            cacheWriteTokens,
            costMicros: null,
            toolCallCount: 0,
            textLength: 0,
            durationMs: 10,
            createdAt: new Date().toISOString(),
        })
        await finishRun(agentId, id, usage, 1)
    }

    it('sums the finished runs of every agent per provider, cache reads and writes apart', async () => {
        const { startRun } = await import('../../db/repos/runs.js')
        await writeAgent('ada', { connectionId: null, provider: null, model: null })
        await writeAgent('bob', { connectionId: null, provider: null, model: null })
        await finishedRun('ada', 'ada-1', 'claude', { inputTokens: 1000, outputTokens: 100, cachedInputTokens: 800 }, 150)
        await finishedRun('ada', 'ada-2', 'claude', { inputTokens: 500, outputTokens: 50, cachedInputTokens: 400 }, 0)
        await finishedRun('bob', 'bob-1', 'claude', { inputTokens: 3000, outputTokens: 10, cachedInputTokens: 0 }, 3000)
        await finishedRun('bob', 'bob-2', 'codex', { inputTokens: 200, outputTokens: 20, cachedInputTokens: 100 }, 0)
        await startRun('bob', 's1', 'bob-unfinished')

        const res = await connectionRoutes.request('/token-usage?range=7d')
        const usage = (await res.json()) as { range: string; providers: { provider: string; totals: Record<string, number>; agents: { agentName: string; inputTokens: number }[] }[] }
        expect(usage.range).toBe('7d')
        expect(usage.providers.map(entry => entry.provider)).toEqual(['claude', 'codex'])
        expect(usage.providers[0].totals).toEqual({ runCount: 3, inputTokens: 4500, outputTokens: 160, cacheReadTokens: 1200, cacheWriteTokens: 3150, reasoningTokens: 0, costMicros: 0 })
        expect(usage.providers[0].agents.map(agent => [agent.agentName, agent.inputTokens])).toEqual([
            ['bob', 3000],
            ['ada', 1500],
        ])
    })

    it('refuses a range it does not know', async () => {
        expect((await connectionRoutes.request('/token-usage?range=1y')).status).toBe(400)
    })
})
