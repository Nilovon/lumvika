import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = await vi.hoisted(async () => (await import('@/test/db-fake')).fakeDb())
vi.mock('@/lib/db', async importOriginal => ({ ...(await importOriginal<object>()), ...db.helpers }))
vi.mock('@/app/api/_services/capacity.service', () => ({ assertEngineEntitlement: vi.fn() }))
vi.mock('@lumvika/cloud/engines', () => ({ claimPoolEngine: vi.fn() }))
vi.mock('@/lib/brain/request-seed', () => ({ requestCompanyBrainSeed: vi.fn() }))

const { NoEngineError, authenticateEngineToken, getWorkspaceConnection } = await import('./workspace-engine.service')

let enginePoolRow: unknown

beforeEach(() => {
    enginePoolRow = null
    db.reset()
    db.answer(call => (call.table === 'engine_pool' ? { data: enginePoolRow } : undefined))
})

function filtersOf(table: string) {
    const [call] = db.calls.filter(each => each.table === table)
    return call.args[call.helper === 'selectMaybeSingleWithJoins' ? 2 : 1]
}

describe('authenticateEngineToken', () => {
    it('answers null for an empty token without touching the database', async () => {
        await expect(authenticateEngineToken('')).resolves.toBeNull()
        expect(db.calls).toHaveLength(0)
    })

    it('looks the engine up by its key and answers the workspace that claimed it', async () => {
        enginePoolRow = { claimed_by_workspace_id: 7, workspace: { id: 7, is_sandbox: true } }
        await expect(authenticateEngineToken('secret')).resolves.toEqual({ workspaceId: 7, isSandbox: true })
        expect(filtersOf('engine_pool')).toEqual({ engine_api_key: 'secret' })
        expect(db.calls.every(call => call.scope.kind === 'service')).toBe(true)
    })

    it('answers null for an engine nobody claimed', async () => {
        enginePoolRow = { claimed_by_workspace_id: null, workspace: null }
        await expect(authenticateEngineToken('secret')).resolves.toBeNull()
    })

    it('answers null for an unknown key', async () => {
        await expect(authenticateEngineToken('nope')).resolves.toBeNull()
    })
})

describe('getWorkspaceConnection', () => {
    it('builds the connection of the machine claimed by the workspace', async () => {
        enginePoolRow = { id: 'i1', engine_host: '10.0.0.1:3000', engine_api_key: 'k', provider_server_id: 'srv' }
        await expect(getWorkspaceConnection(3)).resolves.toEqual({ baseUrl: 'http://10.0.0.1:3000', apiKey: 'k' })
        expect(filtersOf('engine_pool')).toEqual({ claimed_by_workspace_id: 3 })
    })

    it('throws NoEngineError when the workspace has no machine', async () => {
        await expect(getWorkspaceConnection(3)).rejects.toBeInstanceOf(NoEngineError)
    })

    it('throws NoEngineError for a pool row without a host', async () => {
        enginePoolRow = { id: 'i1', engine_host: null, engine_api_key: 'k', provider_server_id: null }
        await expect(getWorkspaceConnection(3)).rejects.toBeInstanceOf(NoEngineError)
    })
})
