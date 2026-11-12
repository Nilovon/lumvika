import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    requireLightSessionActor: vi.fn(),
    visibleProjectIds: vi.fn(),
    visibleChannelIds: vi.fn(),
    listActivityFeed: vi.fn(),
}))

vi.mock('@/app/api/_auth/access', async importOriginal => ({ ...(await importOriginal<typeof import('@/app/api/_auth/access')>()), requireLightSessionActor: mocks.requireLightSessionActor }))
vi.mock('@/app/api/_auth/project-access', () => ({ visibleProjectIds: mocks.visibleProjectIds, visibleChannelIds: mocks.visibleChannelIds }))
vi.mock('@/app/api/_services/work/activity-feed.service', () => ({ listActivityFeed: mocks.listActivityFeed }))

const actions = await import('./activity.actions')

const ACTOR = { kind: 'user', userId: 'me', workspaceId: 7, role: 'member', boxScope: 'all' } as const

beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireLightSessionActor.mockResolvedValue(ACTOR)
    mocks.visibleProjectIds.mockResolvedValue('all')
    mocks.visibleChannelIds.mockResolvedValue(new Set(['c1']))
    mocks.listActivityFeed.mockResolvedValue({ events: [], nextCursor: null, refs: {} })
})

describe('listActivityFeedAction', () => {
    it('passes the filters and the cursor to the feed, a page at a time', async () => {
        await actions.listActivityFeedAction({ projectIds: ['p1'], actorKind: 'agent', entityTypes: ['issue'], before: '2026-11-10T00:00:00.000Z' })
        expect(mocks.listActivityFeed).toHaveBeenCalledWith({ workspaceId: 7 }, { projectIds: ['p1'], actorKind: 'agent', entityTypes: ['issue'], before: '2026-11-10T00:00:00.000Z', limit: 40 }, 'all', new Set(['c1']))
    })

    it('sends a failure back rather than throwing', async () => {
        mocks.listActivityFeed.mockRejectedValue(new Error('down'))
        await expect(actions.listActivityFeedAction()).resolves.toMatchObject({ ok: false, error: 'down' })
    })
})
