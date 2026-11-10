import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

process.env.RERUN_DATA_DIR = mkdtempSync(resolve(tmpdir(), 'rerun-rewind-'))
process.env.RERUN_API_KEY = ''

const { describe, expect, it, beforeAll } = await import('vitest')
const { mkdir } = await import('node:fs/promises')
const { createServer } = await import('../server.js')
const { agentConfigSchema } = await import('../../agents/types.js')
const { writeAgentConfig } = await import('../../agents/config-write.js')
const { agentDir } = await import('../../config/paths.js')
const { createSession } = await import('../../db/repos/sessions.js')
const { finishRun, startRun } = await import('../../db/repos/runs.js')

const id = 'rewindagent'
const app = createServer()

function rewind(agentId: string, from?: string, to?: string) {
    const params = new URLSearchParams()
    if (from !== undefined) params.set('from', from)
    if (to !== undefined) params.set('to', to)
    return app.request(`/agents/${agentId}/rewind?${params}`)
}

beforeAll(async () => {
    await mkdir(agentDir(id), { recursive: true })
    await writeAgentConfig(id, agentConfigSchema.parse({ name: 'rewind' }))
    const session = await createSession(id, 'weekly')
    const run = await startRun(id, session.id)
    await finishRun(id, run.id, { totalTokens: 10 }, 1)
})

describe('GET /agents/:id/rewind', () => {
    it('404s on an unknown agent', async () => {
        const res = await rewind('ghost', '2020-01-01T00:00:00.000Z', '2020-01-08T00:00:00.000Z')
        expect(res.status).toBe(404)
    })

    it.each([
        ['no window at all', undefined, undefined],
        ['a missing end', '2020-01-01T00:00:00.000Z', undefined],
        ['a date that is not ISO', 'yesterday', '2020-01-08T00:00:00.000Z'],
        ['an empty window', '2020-01-08T00:00:00.000Z', '2020-01-08T00:00:00.000Z'],
        ['a reversed window', '2020-01-08T00:00:00.000Z', '2020-01-01T00:00:00.000Z'],
    ])('refuses %s', async (_, from, to) => {
        const res = await rewind(id, from, to)
        expect(res.status).toBe(400)
        expect(await res.json()).toEqual({ error: 'invalid rewind window' })
    })

    it('reports the runs that started inside the window', async () => {
        const from = new Date(Date.now() - 24 * 3600_000).toISOString()
        const to = new Date(Date.now() + 3600_000).toISOString()
        const res = await rewind(id, from, to)
        expect(res.status).toBe(200)
        const report = (await res.json()) as { from: string; to: string; runs: { total: number; done: number }; sessions: number }
        expect(report).toMatchObject({ from, to, runs: { total: 1, done: 1 } })
    })

    it('reports nothing for a window before the agent existed', async () => {
        const res = await rewind(id, '2020-01-01T00:00:00.000Z', '2020-01-08T00:00:00.000Z')
        expect(((await res.json()) as { runs: { total: number } }).runs.total).toBe(0)
    })
})
