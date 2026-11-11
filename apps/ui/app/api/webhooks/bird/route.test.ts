import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Webhook } from 'standardwebhooks'
import { markWhatsAppReplied, markWhatsAppUnreachable, setWhatsAppOptOut } from '@/lib/whatsapp/recipient'
import { applyWhatsAppFailure, applyWhatsAppProgress, loadWhatsAppMessageOwner } from '@/lib/whatsapp/store'
import { POST } from './route'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/whatsapp/recipient', () => ({ markWhatsAppReplied: vi.fn(), markWhatsAppUnreachable: vi.fn(), setWhatsAppOptOut: vi.fn() }))
vi.mock('@/lib/whatsapp/store', () => ({ applyWhatsAppFailure: vi.fn(), applyWhatsAppProgress: vi.fn(), loadWhatsAppMessageOwner: vi.fn() }))

const SECRET = `whsec_${Buffer.from('bird webhook test secret').toString('base64')}`
const AT = '2026-10-09T10:00:00.000Z'
const PHONE = '+32492000000'

function signed(event: object, secret = SECRET): Request {
    const body = JSON.stringify(event)
    const id = 'msg_1'
    const now = new Date()
    return new Request('https://app.lumvika.com/api/webhooks/bird', {
        method: 'POST',
        body,
        headers: { 'webhook-id': id, 'webhook-timestamp': String(Math.floor(now.getTime() / 1000)), 'webhook-signature': new Webhook(secret).sign(id, now, body) },
    })
}

function messageEvent(type: string, data: object = {}) {
    return { type, timestamp: AT, data: { direction: 'outbound', whatsapp_id: 'wam_1', to: { phone_number: PHONE }, metadata: { message_id: 'row-1' }, ...data } }
}

const undeliverable = (metaCode: string) => messageEvent('whatsapp.failed', { error: { code: 'undeliverable', description: 'Message undeliverable', meta_error_code: metaCode, occurred_at: AT } })

beforeEach(() => {
    vi.resetAllMocks()
    vi.stubEnv('BIRD_WEBHOOK_SECRET', SECRET)
    vi.mocked(applyWhatsAppProgress).mockResolvedValue(true)
    vi.mocked(applyWhatsAppFailure).mockResolvedValue(true)
    vi.mocked(setWhatsAppOptOut).mockResolvedValue(true)
    vi.mocked(markWhatsAppUnreachable).mockResolvedValue(true)
    vi.mocked(markWhatsAppReplied).mockResolvedValue(true)
    vi.mocked(loadWhatsAppMessageOwner).mockResolvedValue({ user_id: 'user-1', phone: PHONE })
})

afterEach(() => {
    vi.unstubAllEnvs()
})

describe('POST /api/webhooks/bird', () => {
    it('turns away a delivery signed with another secret, so Bird sends it again', async () => {
        const response = await POST(signed(messageEvent('whatsapp.delivered'), 'whsec_C2FVsBQIhrscChlQIMV+b5sSYspob7oD'))

        expect(response.status).toBe(400)
        expect(applyWhatsAppProgress).not.toHaveBeenCalled()
    })

    it('answers 500 while its secret is missing', async () => {
        vi.stubEnv('BIRD_WEBHOOK_SECRET', '')

        expect((await POST(signed(messageEvent('whatsapp.delivered')))).status).toBe(500)
    })

    it.each(['sent', 'delivered', 'read'] as const)('writes a %s receipt on the row the message carries', async status => {
        const response = await POST(signed(messageEvent(`whatsapp.${status}`)))

        expect(response.status).toBe(200)
        expect(vi.mocked(applyWhatsAppProgress).mock.calls[0].slice(1)).toEqual(['row-1', { status, at: AT, birdMessageId: 'wam_1' }])
    })

    it('leaves alone a message Lumvika did not send through deliverWhatsApp', async () => {
        const response = await POST(signed(messageEvent('whatsapp.delivered', { metadata: null })))

        expect(response.status).toBe(200)
        expect(applyWhatsAppProgress).not.toHaveBeenCalled()
    })

    it('asks for the event again when the write failed', async () => {
        vi.mocked(applyWhatsAppProgress).mockResolvedValue(false)

        expect((await POST(signed(messageEvent('whatsapp.read')))).status).toBe(500)
    })

    it('records a failure with what Bird and Meta said about it', async () => {
        await POST(signed(messageEvent('whatsapp.rejected', { error: { code: 'insufficient_balance', description: 'Wallet is empty', occurred_at: AT } })))

        expect(vi.mocked(applyWhatsAppFailure).mock.calls[0].slice(1)).toEqual(['row-1', { status: 'rejected', at: AT, code: 'insufficient_balance', metaCode: null, description: 'Wallet is empty' }])
        expect(markWhatsAppUnreachable).not.toHaveBeenCalled()
        expect(setWhatsAppOptOut).not.toHaveBeenCalled()
    })

    it('stops writing to a number WhatsApp could not reach', async () => {
        await POST(signed(undeliverable('131026')))

        expect(vi.mocked(markWhatsAppUnreachable).mock.calls[0].slice(1)).toEqual([PHONE, AT])
    })

    it('reads a refused marketing message as an opt-out', async () => {
        await POST(signed(undeliverable('131050')))

        expect(vi.mocked(setWhatsAppOptOut).mock.calls[0].slice(1)).toEqual([PHONE, AT])
    })

    it('does not blame the intended number for a failure on the redirect phone', async () => {
        vi.mocked(loadWhatsAppMessageOwner).mockResolvedValue({ user_id: 'user-1', phone: '+33600000000' })

        await POST(signed(undeliverable('131026')))

        expect(markWhatsAppUnreachable).not.toHaveBeenCalled()
    })

    it.each([
        [{ type: 'preference.revoked', timestamp: AT, data: { channel: 'whatsapp', handle: PHONE } }, AT],
        [{ type: 'preference.granted', timestamp: AT, data: { channel: 'whatsapp', handle: PHONE } }, null],
        [{ type: 'whatsapp_suppression.created', timestamp: AT, data: { address: PHONE } }, AT],
    ])('keeps the opt-out of a number in step with %o', async (event, optedOutAt) => {
        const response = await POST(signed(event))

        expect(response.status).toBe(200)
        expect(vi.mocked(setWhatsAppOptOut).mock.calls[0].slice(1)).toEqual([PHONE, optedOutAt])
    })

    it('marks the number of someone who answered, so the trial sequence leaves them be', async () => {
        const response = await POST(signed({ type: 'whatsapp.received', timestamp: AT, data: { direction: 'inbound', from: { phone_number: PHONE }, text: { body: 'ok go' } } }))

        expect(response.status).toBe(200)
        expect(vi.mocked(markWhatsAppReplied).mock.calls[0].slice(1)).toEqual([PHONE, AT])
    })

    it('accepts the bare test event Bird sends from its dashboard', async () => {
        expect((await POST(signed({ type: 'whatsapp.delivered' }))).status).toBe(200)
        expect(applyWhatsAppProgress).not.toHaveBeenCalled()
    })

    it('ignores a preference on another channel, and an event it does not know', async () => {
        expect((await POST(signed({ type: 'preference.revoked', timestamp: AT, data: { channel: 'sms', handle: PHONE } }))).status).toBe(200)
        expect((await POST(signed({ type: 'whatsapp.reacted', timestamp: AT, data: {} }))).status).toBe(200)

        expect(setWhatsAppOptOut).not.toHaveBeenCalled()
        expect(applyWhatsAppProgress).not.toHaveBeenCalled()
    })
})
