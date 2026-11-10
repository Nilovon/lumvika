import type { createOpenAI } from '@ai-sdk/openai'
import { withAnthropicCacheBreakpoints, type ChatBody } from '@lumvika/contracts'

type FetchFunction = NonNullable<NonNullable<Parameters<typeof createOpenAI>[0]>['fetch']>

/**
 * `@ai-sdk/openai` sends the system prompt as plain strings and drops every `providerOptions` on
 * its way out, so the breakpoints an Anthropic model on OpenRouter needs are written into the body
 * here. The `lumvika` provider never passes through this: the hub, which alone knows what model a
 * tier runs, does the same rewrite on its side.
 */
export function cacheBreakpointsFetch(inner: FetchFunction): FetchFunction {
    return async (input, init) => {
        if (typeof init?.body !== 'string') return inner(input, init)
        let body: ChatBody
        try {
            body = JSON.parse(init.body) as ChatBody
        } catch {
            return inner(input, init)
        }
        if (typeof body.model !== 'string' || !body.model.startsWith('anthropic/')) return inner(input, init)
        return inner(input, { ...init, body: JSON.stringify({ ...withAnthropicCacheBreakpoints(body), provider: { order: ['anthropic'], ...(body.provider as object | undefined) } }) })
    }
}
