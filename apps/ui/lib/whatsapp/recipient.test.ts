import { describe, expect, it, vi } from 'vitest'
import { fakeSupabase } from '@/test/supabase-fake'
import { loadWhatsAppRecipient, markWhatsAppUnreachable, setWhatsAppOptOut } from './recipient'
import type { WhatsAppCategory } from './templates'

const VERIFIED = '2026-10-06T10:00:00.000Z'
const LATER = '2026-10-08T10:00:00.000Z'
const EARLIER = '2026-10-01T10:00:00.000Z'

function phoneRow(overrides: Record<string, unknown> = {}) {
    return { phone: '+32492000000', verified_at: VERIFIED, contact_consent_at: VERIFIED, whatsapp_opted_out_at: null, whatsapp_unreachable_at: null, ...overrides }
}

const recipientOf = (row: Record<string, unknown> | null, category: WhatsAppCategory = 'utility') => loadWhatsAppRecipient(fakeSupabase(() => ({ data: row })).client, 'user-1', category)

describe('loadWhatsAppRecipient', () => {
    it('hands back a verified number whose owner agreed to be contacted', async () => {
        expect(await recipientOf(phoneRow())).toEqual({ ok: true, phone: '+32492000000' })
    })

    it.each([
        [null, 'no_phone'],
        [phoneRow({ phone: null }), 'no_phone'],
        [phoneRow({ verified_at: null }), 'unverified'],
        [phoneRow({ contact_consent_at: null }), 'no_consent'],
        [phoneRow({ whatsapp_opted_out_at: LATER }), 'opted_out'],
        [phoneRow({ whatsapp_unreachable_at: LATER }), 'unreachable'],
        [phoneRow({ phone: '+8613812345678' }), 'unsupported_country'],
        [phoneRow({ phone: '+5511987654321' }), 'unsupported_country'],
    ])('refuses %j as %s', async (row, reason) => {
        expect(await recipientOf(row)).toEqual({ ok: false, reason })
    })

    it('writes to a country where only Bird Verify’s shared sender is refused', async () => {
        expect(await recipientOf(phoneRow({ phone: '+919876543210' }))).toEqual({ ok: true, phone: '+919876543210' })
    })

    it('keeps marketing away from US numbers, not utility nor the rest of +1', async () => {
        expect(await recipientOf(phoneRow({ phone: '+12025550123' }), 'marketing')).toEqual({ ok: false, reason: 'marketing_paused' })
        expect(await recipientOf(phoneRow({ phone: '+12025550123' }), 'utility')).toEqual({ ok: true, phone: '+12025550123' })
        expect(await recipientOf(phoneRow({ phone: '+14165550123' }), 'marketing')).toEqual({ ok: true, phone: '+14165550123' })
    })

    it('forgets a flag earned by the number verified before this one', async () => {
        expect(await recipientOf(phoneRow({ whatsapp_opted_out_at: EARLIER, whatsapp_unreachable_at: EARLIER }))).toEqual({ ok: true, phone: '+32492000000' })
    })
})

describe('flags on a number', () => {
    it('records and lifts an opt-out by number', async () => {
        const supabase = fakeSupabase()

        expect(await setWhatsAppOptOut(supabase.client, '+32492000000', LATER)).toBe(true)
        expect(await setWhatsAppOptOut(supabase.client, '+32492000000', null)).toBe(true)

        expect(supabase.writes('user_phones')).toEqual([
            { method: 'update', payload: { whatsapp_opted_out_at: LATER }, filters: [{ table: 'user_phones', method: 'eq', args: ['phone', '+32492000000'] }] },
            { method: 'update', payload: { whatsapp_opted_out_at: null }, filters: [{ table: 'user_phones', method: 'eq', args: ['phone', '+32492000000'] }] },
        ])
    })

    it('records a number WhatsApp could not reach, and says when the write failed', async () => {
        const supabase = fakeSupabase(() => ({ error: { message: 'boom' } }))
        const error = vi.spyOn(console, 'error').mockImplementation(() => {})

        expect(await markWhatsAppUnreachable(supabase.client, '+32492000000', LATER)).toBe(false)
        expect(supabase.writes('user_phones')[0].payload).toEqual({ whatsapp_unreachable_at: LATER })
        error.mockRestore()
    })
})
