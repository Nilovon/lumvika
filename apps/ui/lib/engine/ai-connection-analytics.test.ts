import { describe, expect, it } from 'vitest'

import { connectionMethod } from './ai-connection-analytics'

describe('connectionMethod', () => {
    it('reads a Codex sign-in as oauth, the device code being its only way in', () => {
        expect(connectionMethod('codex', { CODEX_OAUTH_TOKEN: 'x' })).toBe('oauth')
    })

    it('tells the Claude sign-in the app ran from a setup-token pasted by hand', () => {
        expect(connectionMethod('claude', { CLAUDE_CODE_OAUTH_TOKEN: 'sk-ant-oat', CLAUDE_CODE_OAUTH_REFRESH_TOKEN: 'r' })).toBe('oauth')
        expect(connectionMethod('claude', { CLAUDE_CODE_OAUTH_TOKEN: 'sk-ant-oat' })).toBe('token')
    })

    it('reads every provider billed per token as an api key', () => {
        for (const provider of ['anthropic', 'openai', 'google', 'openrouter']) expect(connectionMethod(provider, { KEY: 'x' })).toBe('api_key')
    })
})
