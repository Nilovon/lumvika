import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { vi } from 'vitest'

process.env.LUMVIKA_DATA_DIR = mkdtempSync(resolve(tmpdir(), 'lumvika-mcp-status-'))

type Probe = { ok: boolean; transport: 'stdio' | 'sse' | 'http'; toolNames: string[]; error?: string }

const mocks = vi.hoisted(() => ({ probes: new Map<string, Probe>(), probed: [] as string[] }))

vi.mock('../../tools/mcp.js', async importOriginal => ({
    ...(await importOriginal<typeof import('../../tools/mcp.js')>()),
    probeMcp: async (_agentId: string, server: { name: string }) => {
        mocks.probed.push(server.name)
        return mocks.probes.get(server.name) ?? { ok: true, transport: 'http', toolNames: [] }
    },
}))

const { beforeEach, describe, expect, it } = await import('vitest')
const { mkdir } = await import('node:fs/promises')
const { agentRoutes } = await import('./agents.js')
const { agentConfigSchema } = await import('../../agents/types.js')
const { writeAgentConfig } = await import('../../agents/config-write.js')
const { agentDir } = await import('../../config/paths.js')

const id = 'statusagent'

const http = (name: string) => ({ name, transport: 'http', url: `https://${name}.example/mcp` })

beforeEach(async () => {
    mocks.probes.clear()
    mocks.probed.length = 0
    await mkdir(agentDir(id), { recursive: true })
    await writeAgentConfig(id, agentConfigSchema.parse({ name: 'status', mcpServers: [http('linear'), http('notion'), http('down'), http('lumvika')] }))
})

describe('GET /agents/:id/mcp-servers/status', () => {
    it('reports each server as connected, waiting on a sign-in, or in error, and never probes the bridge', async () => {
        mocks.probes.set('linear', { ok: true, transport: 'http', toolNames: ['linear_a', 'linear_b'] })
        mocks.probes.set('notion', { ok: false, transport: 'http', toolNames: [], error: 'HTTP 401 Unauthorized' })
        mocks.probes.set('down', { ok: false, transport: 'sse', toolNames: [], error: 'ECONNREFUSED' })

        const res = await agentRoutes.request(`/${id}/mcp-servers/status`)

        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({
            servers: [
                { name: 'linear', status: 'connected', transport: 'http', toolCount: 2 },
                { name: 'notion', status: 'needs_auth', transport: 'http', toolCount: 0, error: 'HTTP 401 Unauthorized' },
                { name: 'down', status: 'error', transport: 'sse', toolCount: 0, error: 'ECONNREFUSED' },
            ],
        })
        expect(mocks.probed).not.toContain('lumvika')
    })

    it('only dials the servers it is asked for', async () => {
        const res = await agentRoutes.request(`/${id}/mcp-servers/status?name=linear&name=down`)
        const body = (await res.json()) as { servers: { name: string }[] }
        expect(body.servers.map(s => s.name)).toEqual(['linear', 'down'])
        expect(mocks.probed).toEqual(['linear', 'down'])
    })

    it('answers 404 for an unknown agent', async () => {
        expect((await agentRoutes.request('/nobody/mcp-servers/status')).status).toBe(404)
    })
})
