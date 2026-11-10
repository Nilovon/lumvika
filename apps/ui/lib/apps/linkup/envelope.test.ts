import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { eventIdOf, parseEnvelope, verifyLinkupSignature } from './envelope'

const SECRET = 'whsec_test'
const NOW = 1_714_386_470

function sign(body: string, timestamp = String(NOW)): string {
    return `v1=${createHmac('sha256', SECRET).update(`${timestamp}.${body}`).digest('hex')}`
}

const MESSAGE = JSON.stringify({
    event_id: 'evt_1',
    account_id: 'acc_1',
    platform: 'linkedin',
    event: {
        type: 'message',
        inbox: 'classic',
        timestamp: '2026-04-28T10:07:45.525693',
        message_text: 'Hello! I would love to connect.',
        sender: { name: 'John Doe', profile_url: 'https://www.linkedin.com/in/ACoAAEMT' },
        conversation: { is_group_chat: false },
        metadata: { conversation_urn: 'urn:li:msg_conversation:1', entity_urn: 'urn:li:msg_message:1' },
    },
})

describe('verifyLinkupSignature', () => {
    it('accepts the signature Linkup computes over "<timestamp>.<raw body>"', () => {
        expect(verifyLinkupSignature(SECRET, String(NOW), sign(MESSAGE), MESSAGE, NOW)).toBe(true)
    })

    it('refuses a changed body, another secret, or a missing v1 prefix', () => {
        expect(verifyLinkupSignature(SECRET, String(NOW), sign(MESSAGE), `${MESSAGE} `, NOW)).toBe(false)
        expect(verifyLinkupSignature('other', String(NOW), sign(MESSAGE), MESSAGE, NOW)).toBe(false)
        expect(verifyLinkupSignature(SECRET, String(NOW), sign(MESSAGE).slice(3), MESSAGE, NOW)).toBe(false)
    })

    it('refuses a delivery replayed long after it was signed', () => {
        expect(verifyLinkupSignature(SECRET, String(NOW), sign(MESSAGE), MESSAGE, NOW + 600)).toBe(false)
    })
})

describe('parseEnvelope', () => {
    it('refuses anything that is not an event of an account', () => {
        expect(parseEnvelope('not json')).toBeNull()
        expect(parseEnvelope(JSON.stringify({ event: { type: 'message' } }))).toBeNull()
    })
})

describe('eventIdOf', () => {
    it('falls back on a hash of the body when the envelope carries no id', () => {
        const body = JSON.stringify({ account_id: 'a', event: { type: 'message' } })
        const envelope = parseEnvelope(body)!
        expect(eventIdOf(envelope, body, null)).toBe(eventIdOf(envelope, body, null))
        expect(eventIdOf(parseEnvelope(MESSAGE)!, MESSAGE, null)).toBe('evt_1')
    })
})
