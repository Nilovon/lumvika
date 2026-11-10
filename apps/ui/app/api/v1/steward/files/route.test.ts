import { beforeEach, describe, expect, it, vi } from 'vitest'

const stewardEngineFilesAction = vi.fn()

vi.mock('@/app/api/_actions/steward-file.actions', () => ({ stewardEngineFilesAction: () => stewardEngineFilesAction() }))
vi.mock('@/app/api/_auth/ownership', async importOriginal => ({
    ...(await importOriginal<typeof import('@/app/api/_auth/ownership')>()),
    requireWorkspaceContext: async () => ({ userId: 'user-1', authUser: { id: 'user-1' }, workspace: { id: 7 }, supabase: {} }),
}))

const { GET } = await import('./route')

const segment = { params: Promise.resolve({}) }
const request = () => new Request('https://app.lumvika.com/api/v1/steward/files')

describe('GET /api/v1/steward/files', () => {
    beforeEach(() => stewardEngineFilesAction.mockReset())

    it('says the steward takes files when its engine does', async () => {
        stewardEngineFilesAction.mockResolvedValue(true)
        expect(await (await GET(request(), segment)).json()).toEqual({ supported: true })
    })

    it('says it does not on a box that predates steward files', async () => {
        stewardEngineFilesAction.mockResolvedValue(false)
        expect(await (await GET(request(), segment)).json()).toEqual({ supported: false })
    })
})
