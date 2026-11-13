import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { vi } from 'vitest'

process.env.LUMVIKA_DATA_DIR = mkdtempSync(resolve(tmpdir(), 'lumvika-issue-runs-'))
process.env.LUMVIKA_API_KEY = ''

const fired = vi.hoisted(() => [] as Array<{ agentId: string; request: unknown }>)

vi.mock('../../runtime/issue-runner.js', () => ({
    fireIssueRun: async (agentId: string, request: unknown) => {
        fired.push({ agentId, request })
        return { started: true, runId: 'run-1', sessionId: 'sess-1' }
    },
}))

const { beforeEach, describe, expect, it } = await import('vitest')
const { createServer } = await import('../server.js')
const { agentDir } = await import('../../config/paths.js')

const app = createServer()

function post(agentId: string, body: unknown) {
    return app.request(`/agents/${agentId}/issue-runs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) })
}

beforeEach(() => {
    fired.length = 0
    mkdirSync(agentDir('writer'), { recursive: true })
    writeFileSync(resolve(agentDir('writer'), 'config.json'), JSON.stringify({ name: 'writer' }))
})

describe('POST /agents/:id/issue-runs', () => {
    it('starts an issue run and answers what started', async () => {
        const res = await post('writer', { ref: 'ENG-12', title: 'Launch post', reason: 'assigned' })
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ started: true, runId: 'run-1', sessionId: 'sess-1' })
        expect(fired).toEqual([{ agentId: 'writer', request: { ref: 'ENG-12', title: 'Launch post', reason: 'assigned' } }])
    })

    it('answers 200 for an unknown coworker, so a 404 keeps meaning an engine without the route', async () => {
        const res = await post('ghost', { ref: 'ENG-12', title: 'Launch post', reason: 'assigned' })
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ started: false, reason: 'not_found' })
        expect(fired).toEqual([])
    })

    it('refuses a malformed request', async () => {
        expect((await post('writer', { ref: 'ENG-12', reason: 'assigned' })).status).toBe(400)
        expect((await post('writer', { ref: 'ENG-12', title: 'x', reason: 'because' })).status).toBe(400)
        expect((await post('writer', 'not json')).status).toBe(400)
        expect(fired).toEqual([])
    })

    it('keeps the steward out', async () => {
        expect((await post('steward', { ref: 'ENG-12', title: 'x', reason: 'assigned' })).status).toBe(403)
    })
})
