import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeSupabase, writeMethodOf } from '@/test/supabase-fake'
import { applyWhatsAppFailure, applyWhatsAppProgress, claimWhatsAppMessage, markWhatsAppMessageAccepted, releaseWhatsAppMessage, type ClaimInput } from './store'

const CLAIM: ClaimInput = { userId: 'user-1', workspaceId: 7, agentId: null, phone: '+32492000000', message: { key: 'payment_failed', category: 'utility' }, language: 'fr', dedupeKey: 'payment_failed:in_1' }

beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
    vi.restoreAllMocks()
})

describe('claimWhatsAppMessage', () => {
    it('writes the row before anything is sent and hands back its id', async () => {
        const supabase = fakeSupabase(() => ({ data: { id: 'row-1' } }))

        expect(await claimWhatsAppMessage(supabase.client, CLAIM)).toEqual({ outcome: 'claimed', id: 'row-1' })
        expect(supabase.writes('whatsapp_messages')[0].payload).toEqual({
            user_id: 'user-1',
            workspace_id: 7,
            agent_id: null,
            phone: '+32492000000',
            template_key: 'payment_failed',
            language: 'fr',
            category: 'utility',
            dedupe_key: 'payment_failed:in_1',
        })
    })

    it('reads a taken dedupe key as a duplicate, and anything else as a failure', async () => {
        expect(await claimWhatsAppMessage(fakeSupabase(() => ({ error: { code: '23505' } })).client, CLAIM)).toEqual({ outcome: 'duplicate' })
        expect(await claimWhatsAppMessage(fakeSupabase(() => ({ error: { code: '42501', message: 'denied' } })).client, CLAIM)).toEqual({ outcome: 'failed' })
    })
})

describe('the life of a message', () => {
    it('keeps the Bird id, and only calls the message accepted while it is still pending', async () => {
        const supabase = fakeSupabase()

        await markWhatsAppMessageAccepted(supabase.client, 'row-1', 'wam_1')

        const [kept, advanced] = supabase.writes('whatsapp_messages')
        expect(kept.payload).toEqual({ bird_message_id: 'wam_1' })
        expect(advanced.payload).toEqual({ status: 'accepted' })
        expect(advanced.filters.at(-1)?.args).toEqual(['status', ['pending']])
    })

    it('dates each event on its own column and never steps the status back', async () => {
        const supabase = fakeSupabase()

        expect(await applyWhatsAppProgress(supabase.client, 'row-1', { status: 'delivered', at: '2026-10-09T10:00:00.000Z', birdMessageId: 'wam_1' })).toBe(true)

        const [dated, advanced] = supabase.writes('whatsapp_messages')
        expect(dated.payload).toEqual({ delivered_at: '2026-10-09T10:00:00.000Z', bird_message_id: 'wam_1' })
        expect(dated.filters).toEqual([{ table: 'whatsapp_messages', method: 'eq', args: ['id', 'row-1'] }])
        expect(advanced.payload).toEqual({ status: 'delivered' })
        expect(advanced.filters.at(-1)?.args).toEqual(['status', ['pending', 'accepted', 'sent']])
    })

    it('lets a read receipt through from any earlier status', async () => {
        const supabase = fakeSupabase()

        await applyWhatsAppProgress(supabase.client, 'row-1', { status: 'read', at: '2026-10-09T10:00:00.000Z', birdMessageId: 'wam_1' })

        expect(supabase.writes('whatsapp_messages')[1].filters.at(-1)?.args).toEqual(['status', ['pending', 'accepted', 'sent', 'delivered']])
    })

    it('records a failure only on a message that had not reached the phone', async () => {
        const supabase = fakeSupabase()

        expect(await applyWhatsAppFailure(supabase.client, 'row-1', { status: 'failed', at: '2026-10-09T10:00:00.000Z', code: 'undeliverable', metaCode: '131026', description: 'Message undeliverable' })).toBe(true)

        const [failed] = supabase.writes('whatsapp_messages')
        expect(failed.payload).toEqual({ status: 'failed', failed_at: '2026-10-09T10:00:00.000Z', error_code: 'undeliverable', meta_error_code: '131026', error: 'Message undeliverable' })
        expect(failed.filters.at(-1)?.args).toEqual(['status', ['pending', 'accepted', 'sent']])
    })

    it('says when an event could not be written, so the webhook asks for it again', async () => {
        const supabase = fakeSupabase((_table, calls) => (writeMethodOf(calls) ? { error: { message: 'boom' } } : undefined))

        expect(await applyWhatsAppProgress(supabase.client, 'row-1', { status: 'sent', at: '2026-10-09T10:00:00.000Z', birdMessageId: 'wam_1' })).toBe(false)
        expect(await applyWhatsAppFailure(supabase.client, 'row-1', { status: 'rejected', at: '2026-10-09T10:00:00.000Z', code: null, metaCode: null, description: null })).toBe(false)
    })

    it('gives a message that never left back to a later try', async () => {
        const supabase = fakeSupabase()

        await releaseWhatsAppMessage(supabase.client, 'row-1')

        expect(supabase.writes('whatsapp_messages')).toEqual([{ method: 'delete', payload: undefined, filters: [{ table: 'whatsapp_messages', method: 'eq', args: ['id', 'row-1'] }] }])
    })
})
