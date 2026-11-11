import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = await vi.hoisted(async () => (await import('@/test/db-fake')).fakeDb())
vi.mock('@/lib/db', async importOriginal => ({ ...(await importOriginal<object>()), ...db.helpers }))
vi.mock('@lumvika/cloud/billing', async importOriginal => ({ ...(await importOriginal<object>()), ...(await import('@/test/cloud-fakes')).CLOUD_ENTITLEMENTS }))

const { authenticateApiKey, bindImportKey, generateApiKey, hashApiKey } = await import('./api-keys')

const LIVE = { keyId: 'k1', workspaceId: 5, createdByUserId: 'u1', scope: 'account', boundAgentId: null }

let keyRow: unknown
let workspaceRow: unknown

const WRITES = new Set(['updateRows', 'insertRows', 'upsertRows', 'deleteRows', 'queryRows'])
const writes = (table: string) => db.calls.filter(call => WRITES.has(call.helper) && call.table === table)

// The SQL of a raw statement with its parameters in place of `$`, and the parameters themselves.
function rendered(query: unknown): { text: string; params: unknown[] } {
    const params: unknown[] = []
    const text = (query as { queryChunks: unknown[] }).queryChunks
        .map(chunk => {
            if (chunk && typeof chunk === 'object' && 'value' in chunk && Array.isArray(chunk.value)) return chunk.value.join('')
            params.push(chunk)
            return '$'
        })
        .join('')
    return { text, params }
}

beforeEach(() => {
    keyRow = { id: 'k1', workspace_id: 5, revoked_at: null, created_by_user_id: 'u1', expires_at: null, scope: 'account', bound_agent_id: null }
    workspaceRow = { subscription_status: 'active', is_sandbox: false }
    db.reset()
    db.answer(call => {
        if (call.helper !== 'selectMaybeSingle') return undefined
        if (call.table === 'api_keys') return { data: keyRow }
        if (call.table === 'workspaces') return { data: workspaceRow }
        return undefined
    })
})

describe('authenticateApiKey', () => {
    it('answers the workspace of a live key, and the member it acts for', async () => {
        const key = generateApiKey()
        await expect(authenticateApiKey(key)).resolves.toEqual(LIVE)
    })

    it('looks the key up by its hash, never by the raw key', async () => {
        const key = generateApiKey()
        await authenticateApiKey(key)
        const [lookup] = db.callsTo('selectMaybeSingle', 'api_keys')
        expect(lookup.args[1]).toEqual({ key_hash: hashApiKey(key) })
        expect(JSON.stringify(lookup.args)).not.toContain(key)
        expect(lookup.scope.kind).toBe('service')
    })

    it('refuses a token without the rk_ prefix without touching the database', async () => {
        await expect(authenticateApiKey('sk_live_whatever')).resolves.toBeNull()
        await expect(authenticateApiKey('')).resolves.toBeNull()
        expect(db.calls).toHaveLength(0)
    })

    it('refuses a revoked key', async () => {
        keyRow = { id: 'k1', workspace_id: 5, revoked_at: '2026-09-01T00:00:00Z' }
        await expect(authenticateApiKey(generateApiKey())).resolves.toBeNull()
        expect(writes('api_keys')).toEqual([])
    })

    it('refuses an unknown key', async () => {
        keyRow = null
        await expect(authenticateApiKey(generateApiKey())).resolves.toBeNull()
    })

    it('marks the key as used on its own row', async () => {
        await authenticateApiKey(generateApiKey())
        expect(db.callsTo('updateRows', 'api_keys').map(call => call.args)).toEqual([[{ last_used_at: expect.any(String) }, { id: 'k1' }]])
    })

    it('stamps the activity of a sandbox, at most once an hour', async () => {
        await authenticateApiKey(generateApiKey())
        await Promise.resolve()
        const [stamp] = db.callsTo('queryRows')
        expect(stamp.scope.kind).toBe('service')
        const { text, params } = rendered(stamp.args[0])
        expect(text).toBe('update public.workspaces set last_active_at = $ where id = $ and is_sandbox = true and (last_active_at is null or last_active_at < $)')
        expect(params[1]).toBe(5)
        expect(Date.parse(params[0] as string) - Date.parse(params[2] as string)).toBeGreaterThanOrEqual(60 * 60_000)
    })

    it('still authenticates when the last_used_at update fails', async () => {
        db.answer(call => {
            if (call.helper === 'updateRows') return { error: { message: 'write failed' } }
            if (call.table === 'api_keys') return { data: keyRow }
            if (call.table === 'workspaces') return { data: workspaceRow }
            return undefined
        })
        await expect(authenticateApiKey(generateApiKey())).resolves.toEqual(LIVE)
    })

    it('refuses a key once the workspace plan is cancelled', async () => {
        workspaceRow = { subscription_status: 'canceled', is_sandbox: false }
        await expect(authenticateApiKey(generateApiKey())).resolves.toBeNull()
        expect(db.callsTo('selectMaybeSingle', 'workspaces')[0].args[1]).toEqual({ id: 5 })
        expect(writes('api_keys')).toEqual([])
    })

    it('accepts a key on a workspace still in its trial', async () => {
        workspaceRow = { subscription_status: 'trialing', is_sandbox: false }
        await expect(authenticateApiKey(generateApiKey())).resolves.toEqual(LIVE)
    })

    it('refuses a key whose workspace is gone', async () => {
        workspaceRow = null
        await expect(authenticateApiKey(generateApiKey())).resolves.toBeNull()
    })

    it('keeps accepting the key of a sandbox, whatever its plan says', async () => {
        workspaceRow = { subscription_status: 'canceled', is_sandbox: true }
        await expect(authenticateApiKey(generateApiKey())).resolves.toEqual(LIVE)
    })

    it('refuses a key past its expiry, and keeps one that has time left', async () => {
        keyRow = { ...(keyRow as object), expires_at: new Date(Date.now() - 1000).toISOString() }
        await expect(authenticateApiKey(generateApiKey())).resolves.toBeNull()
        expect(writes('api_keys')).toEqual([])

        keyRow = { ...(keyRow as object), expires_at: new Date(Date.now() + 60_000).toISOString() }
        await expect(authenticateApiKey(generateApiKey())).resolves.toEqual(LIVE)
    })

    it('answers the scope of an import key and the coworker it is bound to', async () => {
        keyRow = { ...(keyRow as object), scope: 'agent_import', bound_agent_id: 'agent-1' }
        await expect(authenticateApiKey(generateApiKey())).resolves.toEqual({ ...LIVE, scope: 'agent_import', boundAgentId: 'agent-1' })
    })
})

describe('bindImportKey', () => {
    it('binds only an unbound import key, and says whether it won', async () => {
        db.answer(call => (call.table === 'api_keys' ? { data: [{ id: 'k1' }] } : undefined))

        await expect(bindImportKey('k1', 'agent-1')).resolves.toBe(true)
        expect(db.callsTo('updateRows', 'api_keys').map(call => call.args)).toEqual([[{ bound_agent_id: 'agent-1' }, { id: 'k1', scope: 'agent_import', bound_agent_id: { isNull: true } }, ['id']]])
    })

    it('loses to a key another call already bound', async () => {
        db.answer(call => (call.table === 'api_keys' ? { data: [] } : undefined))

        await expect(bindImportKey('k1', 'agent-2')).resolves.toBe(false)
    })
})
