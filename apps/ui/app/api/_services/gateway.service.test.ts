import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ selectMany: vi.fn(), selectMaybeSingle: vi.fn(), spaceAccessMap: vi.fn(), findWorkspaceEngine: vi.fn() }))

vi.mock('@/lib/db', async importOriginal => ({ ...(await importOriginal<object>()), selectMany: mocks.selectMany, selectMaybeSingle: mocks.selectMaybeSingle }))
vi.mock('@/app/api/_auth/access', () => ({ spaceAccessMap: mocks.spaceAccessMap }))
vi.mock('./workspace-engine.service', () => ({ findWorkspaceEngine: mocks.findWorkspaceEngine }))

const { checkAllAgentsHealth } = await import('./gateway.service')

const member = { kind: 'user' as const, userId: 'u2', workspaceId: 1, role: 'member' as const, boxScope: 'all' as const }

describe('checkAllAgentsHealth', () => {
    beforeEach(() => {
        mocks.selectMany.mockResolvedValue({ data: [{ id: 'seen', engine_agent_id: 'e1', space_id: 'open' }, { id: 'hidden', engine_agent_id: 'e2', space_id: 'closed' }], error: null })
        mocks.selectMaybeSingle.mockResolvedValue({ data: { boxes_disabled_at: null, boxes_archived_at: null }, error: null })
        mocks.spaceAccessMap.mockResolvedValue(
            new Map([
                ['open', 'use'],
                ['closed', 'none'],
                ['managed', 'manage'],
            ])
        )
        mocks.findWorkspaceEngine.mockResolvedValue(null)
    })

    it('answers only for the coworkers of the Boxes the caller reaches, and names those Boxes', async () => {
        await expect(checkAllAgentsHealth(member)).resolves.toEqual({ statuses: { seen: 'offline' }, links: [], spaceIds: ['open', 'managed'] })
    })

    it('still names the Boxes the caller reaches when none holds a coworker', async () => {
        mocks.selectMany.mockResolvedValue({ data: [{ id: 'hidden', engine_agent_id: 'e2', space_id: 'closed' }], error: null })
        await expect(checkAllAgentsHealth(member)).resolves.toEqual({ statuses: {}, links: [], spaceIds: ['open', 'managed'] })
    })
})
