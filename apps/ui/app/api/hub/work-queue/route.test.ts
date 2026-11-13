import { beforeEach, describe, expect, it, vi } from 'vitest'

import { nextIssuesFor, releaseStaleCheckouts } from '@/app/api/_services/work/work-queue.service'
import { authenticateEngineToken } from '@/app/api/_services/workspace-engine.service'

import { POST } from './route'

vi.mock('@/app/api/_services/workspace-engine.service', () => ({ authenticateEngineToken: vi.fn() }))
vi.mock('@/app/api/_services/work/work-queue.service', () => ({ nextIssuesFor: vi.fn(), releaseStaleCheckouts: vi.fn() }))

const WORKSPACE_ID = 7

function queueRequest(body: unknown, token: string | null = 'engine-key') {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers.authorization = `Bearer ${token}`
    return new Request('https://lumvika.test/api/hub/work-queue', { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) })
}

describe('POST /api/hub/work-queue', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(authenticateEngineToken).mockImplementation(async token => (token === 'engine-key' ? { workspaceId: WORKSPACE_ID, isSandbox: false } : null))
        vi.mocked(releaseStaleCheckouts).mockResolvedValue(2)
        vi.mocked(nextIssuesFor).mockResolvedValue([{ agentId: 'engine-1', ref: 'ENG-2', title: 'Launch post' }])
    })

    it('lets go of stale checkouts and answers the next issue of each idle coworker, in the workspace of the key', async () => {
        const response = await POST(queueRequest({ coworkers: [{ agentId: 'engine-1' }], liveRunIds: ['run-1'] }))

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ runs: [{ agentId: 'engine-1', ref: 'ENG-2', title: 'Launch post' }], released: 2 })
        expect(releaseStaleCheckouts).toHaveBeenCalledWith({ workspaceId: WORKSPACE_ID, db: expect.objectContaining({ kind: 'service' }) }, ['run-1'], expect.any(Number))
        expect(nextIssuesFor).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: WORKSPACE_ID }), [{ agentId: 'engine-1', skipRefs: [] }], expect.any(Number))
    })

    it('refuses a missing or unknown engine key before reading anything', async () => {
        expect((await POST(queueRequest({ coworkers: [], liveRunIds: [] }, null))).status).toBe(401)
        expect((await POST(queueRequest({ coworkers: [], liveRunIds: [] }, 'stolen'))).status).toBe(401)
        expect(releaseStaleCheckouts).not.toHaveBeenCalled()
    })

    it('refuses a malformed body', async () => {
        expect((await POST(queueRequest('{nope'))).status).toBe(400)
        expect((await POST(queueRequest({ coworkers: [{}], liveRunIds: [] }))).status).toBe(400)
        expect(releaseStaleCheckouts).not.toHaveBeenCalled()
    })

    it('answers 500 when the board cannot be read', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined)
        vi.mocked(releaseStaleCheckouts).mockRejectedValueOnce(new Error('db down'))
        expect((await POST(queueRequest({ coworkers: [], liveRunIds: [] }))).status).toBe(500)
    })
})
