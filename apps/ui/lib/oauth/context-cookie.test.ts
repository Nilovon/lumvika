import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openContext, sealContext } from './context-cookie'
import { mintCallbackGrant, mintConnectTicket } from './mobile-ticket'

const CONTEXT = { agentId: 'agent-1', serverName: 'acme', tokenEndpoint: 'https://auth.acme.test/token' }

beforeEach(() => {
    vi.stubEnv('MOBILE_OAUTH_TICKET_SECRET', 'test-secret')
    vi.useFakeTimers()
})

afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
})

describe('sealContext / openContext', () => {
    it('round-trips the context, unicode included', () => {
        const ctx = { ...CONTEXT, serverName: 'Notion été' }
        expect(openContext(sealContext(ctx))).toEqual(ctx)
    })

    it('refuses a context whose payload was altered', () => {
        const [payload, signature] = sealContext(CONTEXT).split('.')
        const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
        const forged = Buffer.from(JSON.stringify({ ...claims, ctx: { ...CONTEXT, tokenEndpoint: 'http://10.0.0.1/token' } })).toString('base64url')
        expect(() => openContext(`${forged}.${signature}`)).toThrow('Session expired, please retry')
    })

    it('refuses an unsigned base64 context, the format it replaces', () => {
        expect(() => openContext(Buffer.from(JSON.stringify(CONTEXT)).toString('base64'))).toThrow('Session expired, please retry')
    })

    it('refuses a context signed with another secret', () => {
        vi.stubEnv('MOBILE_OAUTH_TICKET_SECRET', 'other-secret')
        const sealed = sealContext(CONTEXT)
        vi.stubEnv('MOBILE_OAUTH_TICKET_SECRET', 'test-secret')
        expect(() => openContext(sealed)).toThrow('Session expired, please retry')
    })

    it('expires after ten minutes', () => {
        const sealed = sealContext(CONTEXT)
        vi.advanceTimersByTime(599_000)
        expect(openContext(sealed)).toEqual(CONTEXT)
        vi.advanceTimersByTime(2_000)
        expect(() => openContext(sealed)).toThrow('Session expired, please retry')
    })

    it('refuses a mobile grant or connect ticket signed with the same secret', () => {
        expect(() => openContext(mintCallbackGrant({ agentId: 'agent-1', workspaceId: 1, userId: 'user-1', jti: 'row-1' }))).toThrow('Session expired, please retry')
        expect(() => openContext(mintConnectTicket({ agentId: 'agent-1', key: 'notion', workspaceId: 1, userId: 'user-1' }))).toThrow('Session expired, please retry')
    })

    it('refuses to seal without a secret on the server', () => {
        vi.stubEnv('MOBILE_OAUTH_TICKET_SECRET', '')
        expect(() => sealContext(CONTEXT)).toThrow('MOBILE_OAUTH_TICKET_SECRET is not configured on this server.')
    })
})
