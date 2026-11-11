import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { fakeScope } from '@/test/db-fake'

const db = await vi.hoisted(async () => (await import('@/test/db-fake')).fakeDb())
vi.mock('@/lib/db', async importOriginal => ({ ...(await importOriginal<object>()), ...db.helpers }))

const { applyWhatsAppFailure, applyWhatsAppProgress, claimWhatsAppMessage, markWhatsAppMessageAccepted, releaseWhatsAppMessage } = await import('./store')
type ClaimInput = Parameters<typeof claimWhatsAppMessage>[1]

const CLAIM: ClaimInput = { userId: 'user-1', workspaceId: 7, agentId: null, phone: '+32492000000', message: { key: 'payment_failed', category: 'utility' }, language: 'en', dedupeKey: 'payment_failed:in_1' }
const scope = fakeScope()

const updates = () => db.callsTo('updateRows', 'whatsapp_messages').map(call => ({ patch: call.args[0], filters: call.args[1] }))

beforeEach(() => {
    db.reset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
    vi.restoreAllMocks()
})

describe('claimWhatsAppMessage', () => {
    it('writes the row before anything is sent and hands back its id', async () => {
        db.answer(() => ({ data: { id: 'row-1' } }))

        expect(await claimWhatsAppMessage(scope, CLAIM)).toEqual({ outcome: 'claimed', id: 'row-1' })
        expect(db.callsTo('insertRow', 'whatsapp_messages')[0].args[0]).toEqual({
            user_id: 'user-1',
            workspace_id: 7,
            agent_id: null,
            phone: '+32492000000',
            template_key: 'payment_failed',
            language: 'en',
            category: 'utility',
            dedupe_key: 'payment_failed:in_1',
        })
    })

    it('reads a taken dedupe key as a duplicate, and anything else as a failure', async () => {
        db.answer(() => ({ error: { code: '23505' } }))
        expect(await claimWhatsAppMessage(scope, CLAIM)).toEqual({ outcome: 'duplicate' })
        db.answer(() => ({ error: { code: '42501', message: 'denied' } }))
        expect(await claimWhatsAppMessage(scope, CLAIM)).toEqual({ outcome: 'failed' })
    })
})

describe('the life of a message', () => {
    it('keeps the Bird id, and only calls the message accepted while it is still pending', async () => {
        await markWhatsAppMessageAccepted(scope, 'row-1', 'wam_1')

        const [kept, advanced] = updates()
        expect(kept.patch).toEqual({ bird_message_id: 'wam_1' })
        expect(advanced.patch).toEqual({ status: 'accepted' })
        expect(advanced.filters).toEqual({ id: 'row-1', status: ['pending'] })
    })

    it('dates each event on its own column and never steps the status back', async () => {
        expect(await applyWhatsAppProgress(scope, 'row-1', { status: 'delivered', at: '2026-10-09T10:00:00.000Z', birdMessageId: 'wam_1' })).toBe(true)

        const [dated, advanced] = updates()
        expect(dated.patch).toEqual({ delivered_at: '2026-10-09T10:00:00.000Z', bird_message_id: 'wam_1' })
        expect(dated.filters).toEqual({ id: 'row-1' })
        expect(advanced.patch).toEqual({ status: 'delivered' })
        expect(advanced.filters).toEqual({ id: 'row-1', status: ['pending', 'accepted', 'sent'] })
    })

    it('lets a read receipt through from any earlier status', async () => {
        await applyWhatsAppProgress(scope, 'row-1', { status: 'read', at: '2026-10-09T10:00:00.000Z', birdMessageId: 'wam_1' })

        expect(updates()[1].filters).toEqual({ id: 'row-1', status: ['pending', 'accepted', 'sent', 'delivered'] })
    })

    it('records a failure only on a message that had not reached the phone', async () => {
        expect(await applyWhatsAppFailure(scope, 'row-1', { status: 'failed', at: '2026-10-09T10:00:00.000Z', code: 'undeliverable', metaCode: '131026', description: 'Message undeliverable' })).toBe(true)

        const [failed] = updates()
        expect(failed.patch).toEqual({ status: 'failed', failed_at: '2026-10-09T10:00:00.000Z', error_code: 'undeliverable', meta_error_code: '131026', error: 'Message undeliverable' })
        expect(failed.filters).toEqual({ id: 'row-1', status: ['pending', 'accepted', 'sent'] })
    })

    it('says when an event could not be written, so the webhook asks for it again', async () => {
        db.answer(call => (call.helper === 'updateRows' ? { error: { message: 'boom' } } : undefined))

        expect(await applyWhatsAppProgress(scope, 'row-1', { status: 'sent', at: '2026-10-09T10:00:00.000Z', birdMessageId: 'wam_1' })).toBe(false)
        expect(await applyWhatsAppFailure(scope, 'row-1', { status: 'rejected', at: '2026-10-09T10:00:00.000Z', code: null, metaCode: null, description: null })).toBe(false)
    })

    it('gives a message that never left back to a later try', async () => {
        await releaseWhatsAppMessage(scope, 'row-1')

        expect(db.callsTo('deleteRows', 'whatsapp_messages').map(call => call.args)).toEqual([[{ id: 'row-1' }]])
    })
})
