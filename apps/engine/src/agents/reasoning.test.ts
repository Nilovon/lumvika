import { describe, expect, it } from 'vitest'
import { reasoningEffortLevels, supportsReasoningEffort } from '@lumvika/contracts'
import { applyCaching } from './caching.js'
import { mergeProviderOptions, reasoningProviderOptions } from './reasoning.js'

describe('reasoning provider options on OpenCode', () => {
    it('asks the way the format asks, and nothing on the chat format', () => {
        expect(reasoningProviderOptions('opencode', 'go/claude-haiku-5-5')).toEqual(reasoningProviderOptions('anthropic'))
        expect(reasoningProviderOptions('opencode', 'go/gpt-6-luna')).toEqual(reasoningProviderOptions('openai'))
        expect(reasoningProviderOptions('opencode', 'go/gemini-4-argon')).toEqual(reasoningProviderOptions('google'))
        expect(reasoningProviderOptions('opencode', 'go/deepseek-v4-pro')).toBeUndefined()
        expect(reasoningProviderOptions('opencode', 'go/unknown')).toBeUndefined()
    })
})

describe('reasoning provider options', () => {
    it('asks each API provider for its reasoning in its own dialect', () => {
        expect(reasoningProviderOptions('anthropic')).toEqual({ anthropic: { thinking: { type: 'adaptive', display: 'summarized' } } })
        expect(reasoningProviderOptions('openai')).toEqual({ openai: { reasoningSummary: 'auto' } })
        expect(reasoningProviderOptions('google')).toEqual({ google: { thinkingConfig: { includeThoughts: true } } })
    })

    it('leaves the providers that are configured elsewhere alone', () => {
        // The two CLIs take it through `defaultSettings`, the two OpenRouter ones through the body.
        expect(reasoningProviderOptions('claude')).toBeUndefined()
        expect(reasoningProviderOptions('codex')).toBeUndefined()
        expect(reasoningProviderOptions('lumvika')).toBeUndefined()
        expect(reasoningProviderOptions('openrouter')).toBeUndefined()
    })

    it('adds the effort in each provider dialect, beside the reasoning ask', () => {
        expect(reasoningProviderOptions('anthropic', 'claude-opus-5-5', 'xhigh')).toEqual({ anthropic: { thinking: { type: 'adaptive', display: 'summarized' }, effort: 'xhigh' } })
        expect(reasoningProviderOptions('openai', 'gpt-6.1-sol', 'low')).toEqual({ openai: { reasoningSummary: 'auto', reasoningEffort: 'low' } })
        expect(reasoningProviderOptions('google', 'gemini-4-argon', 'high')).toEqual({ google: { thinkingConfig: { includeThoughts: true, thinkingLevel: 'high' } } })
        expect(reasoningProviderOptions('codex', 'gpt-6.1-sol', 'medium')).toEqual({ 'codex-app-server': { effort: 'medium' } })
    })

    it('sends what it sent before when no effort is picked', () => {
        expect(reasoningProviderOptions('anthropic', 'claude-opus-5-5', undefined)).toEqual(reasoningProviderOptions('anthropic'))
        expect(reasoningProviderOptions('codex', 'gpt-6.1-sol', undefined)).toBeUndefined()
    })

    it('leaves effort to the claude CLI settings and to nobody on OpenRouter', () => {
        expect(reasoningProviderOptions('claude', 'claude-opus-5-5', 'high')).toBeUndefined()
        expect(reasoningProviderOptions('openrouter', 'anthropic/claude-opus-5.5', 'high')).toBeUndefined()
    })

    it('keeps the prompt cache key when both write under the same provider', () => {
        const cached = applyCaching('openai', { system: { stable: 'be useful', volatile: '' }, messages: [], sessionId: 'session-1' })

        expect(mergeProviderOptions(cached.providerOptions, { openai: { reasoningSummary: 'auto' } })).toEqual({
            openai: { promptCacheKey: 'session-1', reasoningSummary: 'auto' },
        })
    })

    it('merges when either side is missing', () => {
        expect(mergeProviderOptions(undefined, { openai: { reasoningSummary: 'auto' } })).toEqual({ openai: { reasoningSummary: 'auto' } })
        expect(mergeProviderOptions({ openai: { promptCacheKey: 'session-1' } }, undefined)).toEqual({ openai: { promptCacheKey: 'session-1' } })
        expect(mergeProviderOptions(undefined, undefined)).toBeUndefined()
    })

    it('does not touch the anthropic cache breakpoints, which may never land on a thinking block', () => {
        const cached = applyCaching('anthropic', { system: { stable: 'be useful', volatile: '' }, messages: [{ role: 'user', content: 'hi' }], sessionId: 'session-1' })
        const merged = mergeProviderOptions(cached.providerOptions, reasoningProviderOptions('anthropic'))

        expect(merged).toEqual({ anthropic: { thinking: { type: 'adaptive', display: 'summarized' } } })
        expect(cached.messages.filter(m => m.providerOptions?.anthropic)).toHaveLength(1)
        expect(cached.messages.at(-1)?.role).toBe('user')
    })
})

describe('reasoning effort levels', () => {
    it('offers each model only the levels its provider accepts', () => {
        expect(reasoningEffortLevels('anthropic', 'claude-opus-5-5')).toEqual(['low', 'medium', 'high', 'xhigh', 'max'])
        expect(reasoningEffortLevels('claude', 'claude-sonnet-4-6[1m]')).toEqual(['low', 'medium', 'high', 'max'])
        expect(reasoningEffortLevels('claude', 'haiku')).toEqual([])
        expect(reasoningEffortLevels('anthropic', 'claude-haiku-4-5')).toEqual([])
        expect(reasoningEffortLevels('codex', 'gpt-6.1-sol')).toEqual(['low', 'medium', 'high', 'xhigh'])
        expect(reasoningEffortLevels('openai', 'gpt-4o')).toEqual([])
        expect(reasoningEffortLevels('google', 'gemini-4-argon')).toEqual(['low', 'medium', 'high'])
        expect(reasoningEffortLevels('lumvika', 'lumvika-max')).toEqual([])
        expect(reasoningEffortLevels('openrouter', 'anthropic/claude-opus-5.5')).toEqual([])
    })

    it('refuses a level kept from another model', () => {
        expect(supportsReasoningEffort('codex', 'gpt-6.1-sol', 'max')).toBe(false)
        expect(supportsReasoningEffort('claude', 'claude-opus-5-5', 'max')).toBe(true)
        expect(supportsReasoningEffort('claude', 'claude-opus-5-5', undefined)).toBe(false)
    })
})
