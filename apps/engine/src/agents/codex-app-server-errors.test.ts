import { fileURLToPath } from 'node:url'
import { streamText } from 'ai'
import { createCodexAppServer } from 'ai-sdk-provider-codex-cli'
import { describe, expect, it } from 'vitest'

const fakeServer = fileURLToPath(new URL('./__fixtures__/fake-codex-app-server.mjs', import.meta.url))

describe('codex app-server errors', () => {
    it('ends the run with the error when Codex reports a kind the provider does not list', async () => {
        const provider = createCodexAppServer({ defaultSettings: { codexPath: fakeServer, minCodexVersion: '0.144.0', logger: false } })
        const errors: unknown[] = []
        try {
            const result = streamText({ model: provider('gpt-5.6-sol'), prompt: 'hello', onError: ({ error }) => void errors.push(error) })
            for await (const part of result.fullStream) if (part.type === 'error') errors.push(part.error)
        } catch (error) {
            errors.push(error)
        } finally {
            await provider.close()
        }
        expect(String(errors[0] ?? '')).toContain('not supported when using Codex with a ChatGPT account')
    }, 15_000)
})
