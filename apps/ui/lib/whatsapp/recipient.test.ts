import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fakeScope } from '@/test/db-fake'

const db = await vi.hoisted(async () => (await import('@/test/db-fake')).fakeDb())
vi.mock('@/lib/db', async importOriginal => ({ ...(await importOriginal<object>()), ...db.helpers }))

const { loadWhatsAppRecipient, markWhatsAppReplied, markWhatsAppUnreachable, setWhatsAppOptOut } = await import('./recipient')

const LATER = '2026-10-08T10:00:00.000Z'
const scope = fakeScope()

beforeEach(() => db.reset())

describe('loadWhatsAppRecipient', () => {
    it('refuses everyone, since no phone number is kept', async () => {
        expect(await loadWhatsAppRecipient(scope, 'user-1', 'utility')).toEqual({ ok: false, reason: 'no_phone' })
        expect(await loadWhatsAppRecipient(scope, 'user-1', 'marketing')).toEqual({ ok: false, reason: 'no_phone' })
    })
})

describe('flags on a number', () => {
    it('takes every flag as handled without writing anything', async () => {
        expect(await setWhatsAppOptOut(scope, '+32492000000', LATER)).toBe(true)
        expect(await setWhatsAppOptOut(scope, '+32492000000', null)).toBe(true)
        expect(await markWhatsAppUnreachable(scope, '+32492000000', LATER)).toBe(true)
        expect(await markWhatsAppReplied(scope, '+32492000000', LATER)).toBe(true)
        expect(db.calls).toEqual([])
    })
})
