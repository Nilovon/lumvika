import { loadManifest } from '@/app/api/_services/services.service'
import { initiateConnectedAccount } from '@/lib/composio/client'
import { decodeComposioContext } from '@/lib/composio/oauth'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const composioConfigured = vi.fn()
const resolveAuthConfigId = vi.fn()

vi.mock('@/app/api/_auth/access', () => ({ assertAgentAccess: async () => ({ actor: { kind: 'workspace', workspaceId: 7 } }) }))
vi.mock('@/app/api/_services/chat.service', () => ({ resolveAgentTarget: async () => ({ conn: {}, engineAgentId: 'engine-agent-1' }) }))
vi.mock('@/app/api/_services/services.service', () => ({ loadManifest: vi.fn() }))
vi.mock('@/lib/services/registry', () => ({ readRegistry: async () => ({ services: {} }), resolveRegistryEntry: () => null }))
vi.mock('@/lib/composio/settings', () => ({ resolveAuthConfigId: (...args: unknown[]) => resolveAuthConfigId(...args) }))
vi.mock('@/lib/composio/client', async importOriginal => ({
    ...(await importOriginal<typeof import('@/lib/composio/client')>()),
    composioConfigured: () => composioConfigured(),
    initiateConnectedAccount: vi.fn(),
}))

const { POST } = await import('./route')

const gmail = { name: 'Gmail', authMethods: [{ kind: 'composio', mcpServers: [{ name: 'gmail' }], composio: { toolkit: 'gmail', authConfigId: 'ac_catalog' } }] }
const start = () =>
    POST(new Request('https://app.example.com/api/oauth/composio/start', { method: 'POST', headers: { host: 'app.example.com', 'x-forwarded-proto': 'https' }, body: JSON.stringify({ agentId: 'agent-1', key: 'gmail' }) }))

beforeEach(() => {
    vi.stubEnv('MOBILE_OAUTH_TICKET_SECRET', 'test-secret')
    composioConfigured.mockReset().mockResolvedValue(true)
    resolveAuthConfigId.mockReset()
    vi.mocked(loadManifest).mockResolvedValue(gmail as unknown as Awaited<ReturnType<typeof loadManifest>>)
    vi.mocked(initiateConnectedAccount).mockReset().mockResolvedValue({ connectedAccountId: 'ca_1', redirectUrl: 'https://backend.composio.dev/link/abc' })
})

afterEach(() => vi.unstubAllEnvs())

describe('POST /api/oauth/composio/start', () => {
    it('signs in through the auth config the install resolved for the toolkit', async () => {
        resolveAuthConfigId.mockResolvedValue('ac_set_by_admin')
        const res = await start()
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ authorizationUrl: 'https://backend.composio.dev/link/abc' })
        expect(resolveAuthConfigId).toHaveBeenCalledWith(expect.objectContaining({ toolkit: 'gmail', authConfigId: 'ac_catalog' }))
        expect(initiateConnectedAccount).toHaveBeenCalledWith(expect.stringMatching(/_agent_agent-1$/), 'ac_set_by_admin', expect.stringContaining('https://app.example.com/api/oauth/composio/callback?state='))
        const [cookie] = res.cookies.getAll()
        expect(decodeComposioContext(cookie.value)).toMatchObject({ agentId: 'agent-1', key: 'gmail', toolkit: 'gmail', serverName: 'gmail', connectedAccountId: 'ca_1' })
    })

    it('points at the Composio panel when no auth config is set anywhere', async () => {
        resolveAuthConfigId.mockResolvedValue('')
        const res = await start()
        expect(res.status).toBe(400)
        expect((await res.json()).error).toContain('under Composio, in the workspace menu')
        expect(initiateConnectedAccount).not.toHaveBeenCalled()
    })

    it('refuses while the install has no Composio key', async () => {
        composioConfigured.mockResolvedValue(false)
        const res = await start()
        expect(res.status).toBe(400)
        expect((await res.json()).error).toBe('Composio connections are not configured on this server.')
        expect(initiateConnectedAccount).not.toHaveBeenCalled()
    })
})
