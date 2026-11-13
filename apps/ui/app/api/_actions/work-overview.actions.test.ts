import { beforeEach, describe, expect, it, vi } from 'vitest'

import { UnauthenticatedError } from '@/app/api/_auth/errors'

const mocks = vi.hoisted(() => ({
    requireLightSessionActor: vi.fn(),
    visibleProjectIds: vi.fn(),
    visibleChannelIds: vi.fn(),
    visibleAgentIds: vi.fn(),
    listMyWork: vi.fn(),
    getWorkOverview: vi.fn(),
}))

vi.mock('@/app/api/_auth/access', async importOriginal => ({ ...(await importOriginal<typeof import('@/app/api/_auth/access')>()), requireLightSessionActor: mocks.requireLightSessionActor, visibleAgentIds: mocks.visibleAgentIds }))
vi.mock('@/app/api/_auth/project-access', () => ({ visibleProjectIds: mocks.visibleProjectIds, visibleChannelIds: mocks.visibleChannelIds }))
vi.mock('@/app/api/_services/work/my-work.service', () => ({ listMyWork: mocks.listMyWork }))
vi.mock('@/app/api/_services/work/overview.service', () => ({ getWorkOverview: mocks.getWorkOverview }))

const actions = await import('./work-overview.actions')

const ACTOR = { kind: 'user', userId: 'me', workspaceId: 7, role: 'member', boxScope: 'all' } as const
const PROJECTS = new Set(['p1'])
const CHANNELS = new Set(['c1'])
const AGENTS = new Set(['agent-1'])

beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireLightSessionActor.mockResolvedValue(ACTOR)
    mocks.visibleProjectIds.mockResolvedValue(PROJECTS)
    mocks.visibleChannelIds.mockResolvedValue(CHANNELS)
    mocks.visibleAgentIds.mockResolvedValue(AGENTS)
})

describe('getWorkOverviewAction', () => {
    it('gathers the overview over what the caller sees', async () => {
        mocks.getWorkOverview.mockResolvedValue({ counts: { toReview: 1 } })
        await expect(actions.getWorkOverviewAction()).resolves.toEqual({ ok: true, overview: { counts: { toReview: 1 } } })
        expect(mocks.getWorkOverview).toHaveBeenCalledWith({ workspaceId: 7 }, ACTOR, { projects: PROJECTS, channels: CHANNELS, agents: AGENTS })
    })

    it('answers a signed-out caller with a failure', async () => {
        mocks.requireLightSessionActor.mockRejectedValue(new UnauthenticatedError())
        await expect(actions.getWorkOverviewAction()).resolves.toMatchObject({ ok: false })
        expect(mocks.getWorkOverview).not.toHaveBeenCalled()
    })
})

describe('listMyWorkAction', () => {
    it('lists the work of the caller in the projects they see', async () => {
        mocks.listMyWork.mockResolvedValue({ assigned: [], created: [], delegated: [], projects: [] })
        await expect(actions.listMyWorkAction()).resolves.toMatchObject({ ok: true, work: { assigned: [] } })
        expect(mocks.listMyWork).toHaveBeenCalledWith({ workspaceId: 7 }, 'me', PROJECTS)
    })
})
