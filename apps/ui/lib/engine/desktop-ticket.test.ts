import { createHmac } from 'crypto'
import { describe, expect, it } from 'vitest'

import { mintDesktopTicket } from './desktop-ticket'

describe('mintDesktopTicket', () => {
    it('signs a one-minute expiry and the agent with the Box key, in the shape the engine verifies', () => {
        const ticket = mintDesktopTicket('box-key', 'researcher', 'watch', 1_000)
        const [payload, signature] = ticket.split('.')
        expect(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))).toEqual({ exp: 61_000, agent: 'researcher', mode: 'watch' })
        expect(signature).toBe(createHmac('sha256', 'box-key').update(payload).digest('base64url'))
    })

    it('never carries the key', () => {
        expect(mintDesktopTicket('box-key', 'researcher', 'drive')).not.toContain('box-key')
    })
})
