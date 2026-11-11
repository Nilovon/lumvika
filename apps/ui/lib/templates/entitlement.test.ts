import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fakeScope, type DbResolver } from '@/test/db-fake'

const db = await vi.hoisted(async () => (await import('@/test/db-fake')).fakeDb())
vi.mock('@/lib/db', async importOriginal => ({ ...(await importOriginal<object>()), ...db.helpers }))
vi.mock('@lumvika/cloud/marketplace', async () => (await import('@/test/cloud-fakes')).CLOUD_MARKETPLACE)

const { hasTemplateEntitlement, templateAccessByWorkspace } = await import('./entitlement')

function database(resolve: DbResolver = () => undefined) {
    db.answer(resolve)
    return fakeScope()
}

beforeEach(() => db.reset())

const PAID = { id: 'tpl_1', pricing_model: 'one_time', creator_id: 'creator_1' }

describe('templateAccessByWorkspace', () => {
    it('tells an owned template apart from a lapsed, a refunded and an unknown one', async () => {
        const scope = database(() => ({
            data: [
                { template_id: 'active', status: 'active' },
                { template_id: 'late', status: 'past_due' },
                { template_id: 'ended', status: 'canceled' },
                { template_id: 'refunded', status: 'refunded' },
                { template_id: 'odd', status: 'pending' },
            ],
        }))

        const access = await templateAccessByWorkspace(scope, 42)

        expect(Object.fromEntries(access)).toEqual({ active: 'active', late: 'active', ended: 'lapsed', refunded: 'refunded', odd: 'none' })
        expect(db.callsTo('selectMany', 'template_purchases')[0].args[1]).toEqual({ workspace_id: 42 })
    })

    it('answers an empty map when the read fails', async () => {
        const scope = database(() => ({ data: null, error: { message: 'boom' } }))
        await expect(templateAccessByWorkspace(scope, 42)).resolves.toEqual(new Map())
    })
})

describe('hasTemplateEntitlement', () => {
    it('entitles anyone to a free template without reading purchases', async () => {
        const scope = database()
        await expect(hasTemplateEntitlement(scope, 42, { ...PAID, pricing_model: 'free' })).resolves.toBe(true)
        expect(db.calls).toHaveLength(0)
    })

    it('entitles the author to their own template', async () => {
        const scope = database()
        await expect(hasTemplateEntitlement(scope, 42, PAID, 'creator_1')).resolves.toBe(true)
        expect(db.calls).toHaveLength(0)
    })

    it.each([['active'], ['past_due']])('entitles a workspace whose purchase is %s', async status => {
        const scope = database(() => ({ data: { status } }))
        await expect(hasTemplateEntitlement(scope, 42, PAID, 'buyer_1')).resolves.toBe(true)
    })

    it.each([['canceled'], ['refunded']])('refuses a workspace whose purchase is %s', async status => {
        const scope = database(() => ({ data: { status } }))
        await expect(hasTemplateEntitlement(scope, 42, PAID)).resolves.toBe(false)
    })

    it('refuses a workspace that never bought the template', async () => {
        const scope = database(() => ({ data: null }))
        await expect(hasTemplateEntitlement(scope, 42, PAID)).resolves.toBe(false)
    })

    it('does not mistake an anonymous viewer for the author of an authorless template', async () => {
        const scope = database(() => ({ data: null }))
        await expect(hasTemplateEntitlement(scope, 42, { ...PAID, creator_id: null }, null)).resolves.toBe(false)
    })
})
