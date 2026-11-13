import { z } from 'zod'
import type { Provider } from './agent.js'

export const REASONING_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const
export const reasoningEffortSchema = z.enum(REASONING_EFFORTS)
export type ReasoningEffort = z.infer<typeof reasoningEffortSchema>

const ALL_LEVELS: readonly ReasoningEffort[] = REASONING_EFFORTS
const WITHOUT_XHIGH: readonly ReasoningEffort[] = ['low', 'medium', 'high', 'max']
const UP_TO_XHIGH: readonly ReasoningEffort[] = ['low', 'medium', 'high', 'xhigh']
const UP_TO_HIGH: readonly ReasoningEffort[] = ['low', 'medium', 'high']
const NONE: readonly ReasoningEffort[] = []

// `xhigh` arrived with Opus 4.7, and the 4.6 pair stops at the four levels before it. Haiku 4.5
// answers an `effort` with a 400, so it is offered none. The CLI's bare `haiku` alias may still
// resolve to 4.5 on an older client, so it is treated the same way.
function anthropicLevels(model: string): readonly ReasoningEffort[] {
    const id = model.replace(/\[1m\]$/, '')
    if (id === 'haiku' || id.startsWith('claude-haiku-4')) return NONE
    if (id === 'claude-opus-4-6' || id === 'claude-sonnet-4-6') return WITHOUT_XHIGH
    if (id.startsWith('claude-') || id === 'opus' || id === 'sonnet' || id === 'fable') return ALL_LEVELS
    return NONE
}

// Only the reasoning families take `reasoningEffort`: sent to `gpt-4o`, it is a 400.
function openaiLevels(model: string): readonly ReasoningEffort[] {
    return /^gpt-(5|6)/.test(model) ? UP_TO_XHIGH : NONE
}

// `thinkingLevel` is a Gemini 3 setting and stops at `high`.
function googleLevels(model: string): readonly ReasoningEffort[] {
    return /^gemini-([3-9]|\d{2,})/.test(model) ? UP_TO_HIGH : NONE
}

/**
 * The effort levels a model accepts on the provider that serves it, lowest first. Empty when the
 * provider has no such setting, or when Lumvika does not pass it on yet (OpenRouter, the keyless
 * Lumvika models, OpenCode, custom endpoints).
 */
export function reasoningEffortLevels(provider: Provider | string | null | undefined, model: string | null | undefined): readonly ReasoningEffort[] {
    if (!provider || !model) return NONE
    switch (provider) {
        case 'anthropic':
        case 'claude':
            return anthropicLevels(model)
        case 'openai':
        case 'codex':
            return openaiLevels(model)
        case 'google':
            return googleLevels(model)
        default:
            return NONE
    }
}

export function supportsReasoningEffort(provider: Provider | string | null | undefined, model: string | null | undefined, effort: ReasoningEffort | null | undefined): effort is ReasoningEffort {
    return !!effort && reasoningEffortLevels(provider, model).includes(effort)
}

// A level read off a request body the browser wrote: anything else is no pick at all.
export function parseReasoningEffort(value: unknown): ReasoningEffort | undefined {
    return reasoningEffortSchema.safeParse(value).data
}
