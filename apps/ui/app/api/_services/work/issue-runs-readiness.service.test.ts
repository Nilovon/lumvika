import { ENGINE_CAPABILITY_ISSUE_RUNS } from '@lumvika/contracts'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/app/api/_services/workspace-engine.service', () => ({ findWorkspaceEngine: vi.fn() }))
vi.mock('@/lib/engine/client', () => ({ getEngineHealth: vi.fn() }))

const { findWorkspaceEngine } = await import('@/app/api/_services/workspace-engine.service')
const { getEngineHealth } = await import('@/lib/engine/client')
const { issueRunsReadiness } = await import('./issue-runs-readiness.service')

const engine = { instanceId: 'i', conn: { baseUrl: 'https://box', apiKey: 'k' }, managed: true }

beforeEach(() => vi.clearAllMocks())

describe('issueRunsReadiness', () => {
    it('is ready on an engine that advertises issue runs, outdated on one that does not', async () => {
        vi.mocked(findWorkspaceEngine).mockResolvedValue(engine as never)
        vi.mocked(getEngineHealth).mockResolvedValueOnce({ capabilities: [ENGINE_CAPABILITY_ISSUE_RUNS] } as never)
        expect(await issueRunsReadiness(7)).toBe('ready')
        vi.mocked(getEngineHealth).mockResolvedValueOnce({ capabilities: ['assistant'] } as never)
        expect(await issueRunsReadiness(7)).toBe('outdated')
    })

    it('tells a workspace without a server from one whose server does not answer', async () => {
        vi.mocked(findWorkspaceEngine).mockResolvedValueOnce(null)
        expect(await issueRunsReadiness(7)).toBe('no_engine')
        vi.mocked(findWorkspaceEngine).mockResolvedValueOnce(engine as never)
        vi.mocked(getEngineHealth).mockRejectedValueOnce(new Error('timeout'))
        expect(await issueRunsReadiness(7)).toBe('unreachable')
    })
})
