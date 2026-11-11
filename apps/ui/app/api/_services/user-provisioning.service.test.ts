import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fakeScope, type DbCall } from '@/test/db-fake'

const db = await vi.hoisted(async () => (await import('@/test/db-fake')).fakeDb())
vi.mock('@/lib/db', async importOriginal => ({ ...(await importOriginal<object>()), ...db.helpers }))

const grantLumvikaTopup = vi.fn()
vi.mock('@lumvika/cloud/billing.server', () => ({ grantLumvikaTopup: (...args: unknown[]) => grantLumvikaTopup(...args) }))
vi.mock('@lumvika/cloud/illustrations', () => ({ ILLUSTRATION_ENTRIES: [] }))

const { provisionUser } = await import('./user-provisioning.service')

const account = { id: 'user-1', isAnonymous: false }
const visitor = { id: 'user-1', isAnonymous: true }
const request = fakeScope('user', 'user-1')

const writes = (helper: DbCall['helper'], table: string) => db.callsTo(helper, table).map(call => call.args[0])
const servicedWrites = (helper: DbCall['helper'], table: string) =>
    db
        .callsTo(helper, table)
        .filter(call => call.scope.kind === 'service')
        .map(call => call.args[0])

// The request scope only reads the users row; the stamp lands when the service answers the row it wrote.
const existing = (signedUpAt: string | null) =>
    db.answer(call => {
        if (call.helper === 'selectMaybeSingle' && call.table === 'users') return { data: { id: 'user-1', workspace_id: 7, signed_up_at: signedUpAt } }
        if (call.helper === 'updateRows' && call.table === 'users') return { data: [{ id: 'user-1' }] }
        return undefined
    })
const newAccount = () => db.answer(call => (call.helper === 'insertRow' && call.table === 'workspaces' ? { data: { id: 7 } } : undefined))

beforeEach(() => {
    db.reset()
    grantLumvikaTopup.mockReset()
})

describe('provisionUser and the signup stamp', () => {
    it('stamps an anonymous visitor who just became an account, and grants the allowance once', async () => {
        existing(null)
        expect(await provisionUser(request, account, { priceArm: null })).toEqual({ signedUp: true })
        expect(servicedWrites('updateRows', 'users')).toEqual([{ signed_up_at: expect.any(String) }])
        expect(grantLumvikaTopup).toHaveBeenCalledTimes(1)
    })

    it('leaves an account that already signed up, and a visitor still anonymous, as they are', async () => {
        existing('2026-09-01T00:00:00Z')
        await provisionUser(request, account, { priceArm: null })
        existing(null)
        await provisionUser(request, visitor, { priceArm: null })
        expect(writes('updateRows', 'users')).toEqual([])
        expect(grantLumvikaTopup).not.toHaveBeenCalled()
    })

    it('writes the users row with the service scope, never with the request scope', async () => {
        newAccount()
        expect(await provisionUser(request, account, { priceArm: null })).toEqual({ signedUp: true })
        expect(db.callsTo('insertRows').every(call => call.scope.kind === 'service')).toBe(true)
        expect(servicedWrites('insertRows', 'users')).toEqual([expect.objectContaining({ id: 'user-1', workspace_id: 7 })])
        expect(servicedWrites('insertRows', 'workspace_members')).toEqual([{ user_id: 'user-1', workspace_id: 7, role: 'admin' }])
    })
})

describe('provisionUser and the price test', () => {
    it('freezes the arm drawn for this request on the workspace it creates', async () => {
        newAccount()
        await provisionUser(request, account, { priceArm: '29' })
        expect(writes('insertRow', 'workspaces')).toEqual([expect.objectContaining({ price_arm: '29' })])
    })

    it('leaves a workspace out of the test when no arm was drawn', async () => {
        newAccount()
        await provisionUser(request, account, { priceArm: null })
        expect(writes('insertRow', 'workspaces')).toEqual([expect.objectContaining({ price_arm: null })])
    })
})

describe('provisionUser on an install without the illustration library', () => {
    it('creates the workspace with no icon rather than a link to a missing file', async () => {
        newAccount()
        await provisionUser(request, account, { priceArm: null })
        expect(writes('insertRow', 'workspaces')).toEqual([expect.objectContaining({ icon_url: null })])
    })
})
