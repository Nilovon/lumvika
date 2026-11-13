import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getAuthUser = vi.fn()
const edition = { LUMVIKA_CLOUD: false }
const readComposioOverview = vi.fn()
const connectComposio = vi.fn()

vi.mock('@lumvika/cloud/edition', () => edition)
vi.mock('@/lib/auth/session/getServerSession', () => ({ getAuthUser: () => getAuthUser() }))
vi.mock('@/app/api/_services/composio-settings.service', () => ({
    readComposioOverview: () => readComposioOverview(),
    connectComposio: (...args: unknown[]) => connectComposio(...args),
    disconnectComposio: vi.fn(),
    setToolkitAuthConfig: vi.fn(),
    clearToolkitAuthConfig: vi.fn(),
    createToolkitAuthConfig: vi.fn(),
}))

const { connectComposioAction, getComposioOverviewAction } = await import('./composio.actions')

beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_ADMIN_EMAILS', 'admin@example.com')
    edition.LUMVIKA_CLOUD = false
    getAuthUser.mockReset()
    readComposioOverview.mockReset().mockResolvedValue({ services: [] })
    connectComposio.mockReset().mockResolvedValue(undefined)
})

afterEach(() => vi.unstubAllEnvs())

describe('the Composio actions', () => {
    it('answer an admin of the install', async () => {
        getAuthUser.mockResolvedValue({ id: 'user-1', email: 'Admin@example.com' })
        expect(await getComposioOverviewAction()).toEqual({ ok: true, overview: { services: [] } })
        await connectComposioAction({ apiKey: 'key' })
        expect(connectComposio).toHaveBeenCalledWith('key', 'user-1')
    })

    it('refuse a signed-in person who is not in ADMIN_EMAILS, even a workspace admin', async () => {
        getAuthUser.mockResolvedValue({ id: 'user-2', email: 'member@example.com' })
        expect(await getComposioOverviewAction()).toMatchObject({ ok: false, code: 'adminOnlyComposio' })
        expect(await connectComposioAction({ apiKey: 'key' })).toMatchObject({ ok: false, code: 'adminOnlyComposio' })
        expect(readComposioOverview).not.toHaveBeenCalled()
        expect(connectComposio).not.toHaveBeenCalled()
    })

    it('refuse a visitor without a session', async () => {
        getAuthUser.mockResolvedValue(null)
        expect(await getComposioOverviewAction()).toMatchObject({ ok: false, code: 'notAuthenticated' })
    })

    it('stay closed on Lumvika Cloud, whose key and auth configs are its own', async () => {
        edition.LUMVIKA_CLOUD = true
        getAuthUser.mockResolvedValue({ id: 'user-1', email: 'admin@example.com' })
        expect(await getComposioOverviewAction()).toMatchObject({ ok: false, code: 'composioManagedByCloud' })
    })
})
