import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { STEWARD_HUB_TOKEN_TTL_MS, stewardHubTokenRequired, mintStewardHubToken, verifyStewardHubToken } from './hub-token'

const WORKSPACE_ID = 42

function tamper(token: string, claims: Record<string, unknown>): string {
    const [payload, signature] = token.split('.')
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')), ...claims })).toString('base64url')
    return `${forged}.${signature}`
}

beforeEach(() => {
    vi.stubEnv('STEWARD_HUB_TOKEN_SECRET', 'test-secret')
    vi.useFakeTimers()
})

afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
})

describe('steward hub token', () => {
    it('round-trips for the workspace it was minted for', () => {
        expect(verifyStewardHubToken(mintStewardHubToken(WORKSPACE_ID), WORKSPACE_ID)).not.toBeNull()
    })

    it('refuses a token minted for another workspace', () => {
        expect(verifyStewardHubToken(mintStewardHubToken(WORKSPACE_ID), 7)).toBeNull()
    })

    it('refuses a rewritten, truncated or empty token', () => {
        const token = mintStewardHubToken(WORKSPACE_ID)!
        expect(verifyStewardHubToken(tamper(token, { ws: 7 }), 7)).toBeNull()
        expect(verifyStewardHubToken(tamper(token, { exp: Date.now() + 10 * STEWARD_HUB_TOKEN_TTL_MS }), WORKSPACE_ID)).toBeNull()
        expect(verifyStewardHubToken(token.split('.')[0], WORKSPACE_ID)).toBeNull()
        expect(verifyStewardHubToken(`${token}.extra`, WORKSPACE_ID)).toBeNull()
        expect(verifyStewardHubToken('', WORKSPACE_ID)).toBeNull()
        expect(verifyStewardHubToken(null, WORKSPACE_ID)).toBeNull()
    })

    it('refuses a token signed with another secret', () => {
        const token = mintStewardHubToken(WORKSPACE_ID)
        vi.stubEnv('STEWARD_HUB_TOKEN_SECRET', 'rotated-secret')
        expect(verifyStewardHubToken(token, WORKSPACE_ID)).toBeNull()
    })

    it('expires after twelve hours', () => {
        const token = mintStewardHubToken(WORKSPACE_ID)
        vi.advanceTimersByTime(STEWARD_HUB_TOKEN_TTL_MS - 1_000)
        expect(verifyStewardHubToken(token, WORKSPACE_ID)).not.toBeNull()
        vi.advanceTimersByTime(2_000)
        expect(verifyStewardHubToken(token, WORKSPACE_ID)).toBeNull()
    })

    it('mints nothing and accepts nothing without a secret', () => {
        const token = mintStewardHubToken(WORKSPACE_ID)
        vi.stubEnv('STEWARD_HUB_TOKEN_SECRET', '')
        expect(mintStewardHubToken(WORKSPACE_ID)).toBeNull()
        expect(verifyStewardHubToken(token, WORKSPACE_ID)).toBeNull()
    })

    it('is required as soon as the hub holds a secret, unless told to tolerate', () => {
        vi.stubEnv('STEWARD_HUB_TOKEN_REQUIRED', '')
        expect(stewardHubTokenRequired()).toBe(true)
        vi.stubEnv('STEWARD_HUB_TOKEN_REQUIRED', '1')
        expect(stewardHubTokenRequired()).toBe(true)
        vi.stubEnv('STEWARD_HUB_TOKEN_REQUIRED', '0')
        expect(stewardHubTokenRequired()).toBe(false)
        vi.stubEnv('STEWARD_HUB_TOKEN_REQUIRED', '')
        vi.stubEnv('STEWARD_HUB_TOKEN_SECRET', '')
        expect(stewardHubTokenRequired()).toBe(false)
    })

    it('carries the member the turn speaks for, and none for a workspace token', () => {
        expect(verifyStewardHubToken(mintStewardHubToken(WORKSPACE_ID, 'user-7'), WORKSPACE_ID)?.uid).toBe('user-7')
        expect(verifyStewardHubToken(mintStewardHubToken(WORKSPACE_ID), WORKSPACE_ID)?.uid).toBeUndefined()
    })
})
