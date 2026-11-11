import { beforeEach, describe, expect, it, vi } from 'vitest'

import { hashApiKey } from '@/lib/mcp/api-keys'
import type { DbAnswer, DbCall } from '@/test/db-fake'
vi.mock('@lumvika/cloud/billing', async importOriginal => ({ ...(await importOriginal<object>()), ...(await import('@/test/cloud-fakes')).CLOUD_ENTITLEMENTS }))

const mocks = vi.hoisted(() => ({ getServerSession: vi.fn() }))

const db = await vi.hoisted(async () => (await import('@/test/db-fake')).fakeDb())
vi.mock('@/lib/db', async importOriginal => ({ ...(await importOriginal<object>()), ...db.helpers }))
vi.mock('@/lib/auth/session/getServerSession', () => ({ getServerSession: mocks.getServerSession, getSessionWorkspace: mocks.getServerSession }))
vi.mock('@/lib/app-origin', () => ({ getAppOrigin: async () => 'https://app.lumvika.com' }))
vi.mock('@/app/api/_auth/access', async importOriginal => ({ ...(await importOriginal<object>()), manageableSpaceIds: vi.fn(async () => 'all') }))

const { createApiKeyAction, createImportKeyAction, listApiKeysAction, revokeApiKeyAction } = await import('./api-keys.actions')
const { manageableSpaceIds } = await import('@/app/api/_auth/access')

const WORKSPACE_ID = 7

const WRITES = new Set<DbCall['helper']>(['insertRows', 'insertRow', 'updateRows', 'deleteRows', 'upsertRows'])
const isWrite = (call: DbCall) => WRITES.has(call.helper)
const writesTo = (table: string) => db.calls.filter(call => isWrite(call) && call.table === table)

function database(resolve: (call: DbCall) => DbAnswer | undefined = () => undefined, role: 'admin' | 'member' = 'admin') {
    db.answer(call => (call.table === 'workspace_members' ? { data: { user_id: 'user-1', role, box_scope: 'all' } } : resolve(call)))
}

const counting = (count: number) => (call: DbCall) => (call.helper === 'selectCount' ? { data: count } : undefined)

function signedIn(workspace: { subscription_status: string | null; is_sandbox: boolean }) {
    mocks.getServerSession.mockResolvedValue({
        user: { id: 'user-1', workspace_id: WORKSPACE_ID },
        workspace: { id: WORKSPACE_ID, name: 'Acme', ...workspace },
        session: { id: 'user-1', email: 'me@acme.test' },
        workspaceRefused: false,
    })
}

beforeEach(() => {
    vi.clearAllMocks()
    db.reset()
    signedIn({ subscription_status: 'active', is_sandbox: false })
})

describe('createApiKeyAction', () => {
    it('refuses a member who is not an admin', async () => {
        database(counting(0), 'member')

        await expect(createApiKeyAction('CI')).resolves.toEqual({ ok: false, error: 'Only an admin can manage API keys', code: 'adminOnlyApiKeys' })
        expect(writesTo('api_keys')).toHaveLength(0)
    })

    it('refuses a workspace whose subscription is over', async () => {
        signedIn({ subscription_status: 'canceled', is_sandbox: false })
        database()

        const result = await createApiKeyAction('CI')

        expect(result.ok).toBe(false)
        expect(writesTo('api_keys')).toHaveLength(0)
    })

    it('lets a workspace on trial create a key', async () => {
        signedIn({ subscription_status: 'trialing', is_sandbox: false })
        database(counting(0))

        await expect(createApiKeyAction('CI')).resolves.toMatchObject({ ok: true })
    })

    it('lets a sandbox create a key without a subscription', async () => {
        signedIn({ subscription_status: null, is_sandbox: true })
        database(counting(0))

        await expect(createApiKeyAction('CI')).resolves.toMatchObject({ ok: true })
    })

    it('refuses a twenty-first active key', async () => {
        database(counting(20))

        await expect(createApiKeyAction('CI')).resolves.toEqual({ ok: false, error: 'This workspace already has 20 active keys. Revoke one to create another.', code: 'tooManyActiveKeys', params: { max: 20 } })
        expect(writesTo('api_keys')).toHaveLength(0)
    })

    it('counts only the unrevoked keys of this workspace', async () => {
        database(counting(3))

        await createApiKeyAction('CI')

        expect(db.callsTo('selectCount', 'api_keys').map(call => call.args)).toEqual([[{ workspace_id: WORKSPACE_ID, revoked_at: { isNull: true }, scope: 'account' }]])
    })

    it('stores only the hash and the display prefix, and hands the raw key back once', async () => {
        database(counting(0))

        const result = await createApiKeyAction('  CI  ')
        if (!result.ok) throw new Error(result.error)

        const [write] = writesTo('api_keys')
        expect(write.args[0]).toEqual({ workspace_id: WORKSPACE_ID, name: 'CI', key_prefix: result.key.slice(0, 12), key_hash: hashApiKey(result.key), created_by: 'me@acme.test', created_by_user_id: 'user-1' })
        expect(JSON.stringify(write.args[0])).not.toContain(result.key)
    })

    it('refuses an empty name and a name past sixty characters', async () => {
        database(counting(0))

        await expect(createApiKeyAction('   ')).resolves.toMatchObject({ ok: false })
        await expect(createApiKeyAction('x'.repeat(61))).resolves.toEqual({ ok: false, error: 'Keep the name under 60 characters.', code: 'nameTooLongDot', params: { max: 60 } })
    })
})

describe('revokeApiKeyAction', () => {
    it('refuses a member who is not an admin', async () => {
        database(() => ({ data: { workspace_id: WORKSPACE_ID } }), 'member')

        await expect(revokeApiKeyAction('key-1')).resolves.toEqual({ ok: false, error: 'Only an admin can manage API keys', code: 'adminOnlyApiKeys' })
        expect(writesTo('api_keys')).toHaveLength(0)
    })

    it('answers Key not found for a key of another workspace and writes nothing', async () => {
        database(call => (call.table === 'api_keys' ? { data: { workspace_id: 99 } } : undefined))

        await expect(revokeApiKeyAction('key-1')).resolves.toEqual({ ok: false, error: 'Key not found', code: 'keyNotFound' })
        expect(writesTo('api_keys')).toHaveLength(0)
    })

    it('answers Key not found for a key that does not exist', async () => {
        database()

        await expect(revokeApiKeyAction('key-1')).resolves.toEqual({ ok: false, error: 'Key not found', code: 'keyNotFound' })
        expect(writesTo('api_keys')).toHaveLength(0)
    })

    it('stamps revoked_at on a key of the workspace', async () => {
        database(call => (call.table === 'api_keys' && !isWrite(call) ? { data: { workspace_id: WORKSPACE_ID } } : undefined))

        await expect(revokeApiKeyAction('key-1')).resolves.toEqual({ ok: true })
        const [write] = writesTo('api_keys')
        expect(write.helper).toBe('updateRows')
        expect(write.args.slice(0, 2)).toEqual([{ revoked_at: expect.any(String) }, { id: 'key-1' }])
    })
})

describe('createImportKeyAction', () => {
    const spaces = (rows: { id: string }[]) => (call: DbCall) => (call.table === 'spaces' ? { data: rows } : undefined)

    it('stores an import key that expires in a day, and puts it in the connector URL and the prompt', async () => {
        database(spaces([{ id: 'box-1' }]), 'member')
        const before = Date.now()

        const result = await createImportKeyAction('openclaw')
        if (!result.ok) throw new Error(result.error)

        const [write] = writesTo('api_keys')
        const payload = write.args[0] as Record<string, unknown>
        expect(payload).toMatchObject({ workspace_id: WORKSPACE_ID, name: 'Import · OpenClaw', scope: 'agent_import', created_by_user_id: 'user-1' })
        const ttl = Date.parse(payload.expires_at as string) - before
        expect(ttl).toBeGreaterThan(23.9 * 3600_000)
        expect(ttl).toBeLessThanOrEqual(24 * 3600_000 + 1000)

        const key = result.connectorUrl.split('/').pop()!
        expect(result.connectorUrl).toBe(`https://app.lumvika.com/api/mcp/account/${key}`)
        expect(payload.key_hash).toBe(hashApiKey(key))
        expect(JSON.stringify(payload)).not.toContain(key)
        expect(result.prompt).toContain(result.connectorUrl)
        expect(result.prompt).toContain('spaceId "box-1"')
    })

    it('lands in the Box asked for when the member manages it, otherwise in the first one they manage', async () => {
        database(spaces([{ id: 'box-1' }, { id: 'box-2' }]), 'member')
        vi.mocked(manageableSpaceIds).mockResolvedValueOnce(new Set(['box-2']))
        const managed = await createImportKeyAction('hermes', 'box-1')
        expect(managed.ok && managed.prompt).toContain('spaceId "box-2"')

        const asked = await createImportKeyAction('hermes', 'box-2')
        expect(asked.ok && asked.prompt).toContain('spaceId "box-2"')
    })

    it('refuses a member who manages no Box, and an unknown source', async () => {
        database(spaces([{ id: 'box-1' }]), 'member')
        vi.mocked(manageableSpaceIds).mockResolvedValueOnce(new Set())

        await expect(createImportKeyAction('grok')).resolves.toEqual({ ok: false, error: 'You manage no Box in this workspace yet. Create one first.', code: 'noManagedBox' })
        await expect(createImportKeyAction('nope' as 'grok')).resolves.toEqual({ ok: false, error: 'Unknown source', code: 'unknownSource' })
        expect(writesTo('api_keys')).toHaveLength(0)
    })

    it('refuses a workspace whose subscription is over', async () => {
        signedIn({ subscription_status: 'canceled', is_sandbox: false })
        database(spaces([{ id: 'box-1' }]))

        await expect(createImportKeyAction('openclaw')).resolves.toMatchObject({ ok: false })
        expect(writesTo('api_keys')).toHaveLength(0)
    })
})

describe('listApiKeysAction', () => {
    it('leaves out a key past its expiry', async () => {
        const past = new Date(Date.now() - 1000).toISOString()
        const future = new Date(Date.now() + 60_000).toISOString()
        database(call =>
            call.table === 'api_keys'
                ? {
                      data: [
                          { id: 'a', name: 'Live', key_prefix: 'rk_a', created_by: null, last_used_at: null, created_at: past, expires_at: null },
                          { id: 'b', name: 'Import · Grok', key_prefix: 'rk_b', created_by: null, last_used_at: null, created_at: past, expires_at: future },
                          { id: 'c', name: 'Import · OpenClaw', key_prefix: 'rk_c', created_by: null, last_used_at: null, created_at: past, expires_at: past },
                      ],
                  }
                : undefined,
        )

        const result = await listApiKeysAction()
        if (!result.ok) throw new Error(result.error)
        expect(result.keys.map(key => key.id)).toEqual(['a', 'b'])
    })
})
