import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mintClaudeSignIn, mintCodexSignIn, openClaudeSignIn, openCodexSignIn } from './sign-in-ticket'

beforeEach(() => {
    vi.stubEnv('MOBILE_OAUTH_TICKET_SECRET', 'test-secret')
    vi.useFakeTimers()
})

afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
})

describe('subscription sign-in tickets', () => {
    it('hand back what the sign-in started with, to the person who started it', () => {
        expect(openClaudeSignIn(mintClaudeSignIn('user-1', { verifier: 'v', state: 's' }), 'user-1')).toEqual({ verifier: 'v', state: 's' })
        expect(openCodexSignIn(mintCodexSignIn('user-1', { deviceAuthId: 'd', userCode: 'ABCD' }), 'user-1')).toEqual({ deviceAuthId: 'd', userCode: 'ABCD' })
    })

    it('refuse another person, a rewritten ticket, one of the other kind, and an old one', () => {
        const claude = mintClaudeSignIn('user-1', { verifier: 'v', state: 's' })
        expect(() => openClaudeSignIn(claude, 'user-2')).toThrow('another account')
        expect(() => openClaudeSignIn(`${claude.split('.')[0]}x.${claude.split('.')[1]}`, 'user-1')).toThrow('Invalid sign-in')
        expect(() => openCodexSignIn(claude, 'user-1')).toThrow('Invalid sign-in')
        vi.advanceTimersByTime(16 * 60_000)
        expect(() => openClaudeSignIn(claude, 'user-1')).toThrow('expired')
    })
})
