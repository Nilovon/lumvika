import { afterEach, describe, expect, it, vi } from 'vitest'

const MODELS = { 'lumvika-fast': 'openai/gpt-6-luna', 'lumvika-max': 'anthropic/claude-haiku-5.5', 'lumvika-smart': 'openai/gpt-6-sol' }

async function freshModule(hub = 'https://hub.example.com/') {
    vi.resetModules()
    vi.stubEnv('LUMVIKA_HUB_BASE_URL', hub)
    vi.stubEnv('LUMVIKA_API_KEY', 'box-key')
    return await import('./lumvika-upstream.js')
}

afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
})

describe('the model behind a Lumvika alias', () => {
    it('is the one the hub names, asked with the box key', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ models: MODELS }))
        const { answeringModel } = await freshModule()

        expect(await answeringModel('lumvika', 'lumvika-smart')).toBe('openai/gpt-6-sol')
        expect(fetchMock).toHaveBeenCalledWith('https://hub.example.com/api/llm/models', expect.objectContaining({ headers: { Authorization: 'Bearer box-key' } }))
    })

    it('is asked once, then again after five minutes', async () => {
        vi.useFakeTimers({ toFake: ['Date'] })
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ models: MODELS }))
        const { answeringModel } = await freshModule()

        await answeringModel('lumvika', 'lumvika-smart')
        await answeringModel('lumvika', 'lumvika-max')
        expect(fetchMock).toHaveBeenCalledTimes(1)

        vi.advanceTimersByTime(5 * 60_000)
        fetchMock.mockImplementation(async () => Response.json({ models: { ...MODELS, 'lumvika-smart': 'anthropic/claude-haiku-5.5' } }))
        await answeringModel('lumvika', 'lumvika-smart')
        await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
        await vi.waitFor(async () => expect(await answeringModel('lumvika', 'lumvika-smart')).toBe('anthropic/claude-haiku-5.5'))
    })

    // An older hub answers 404: the alias stands for itself, which keeps the message first, as before.
    it('stays the alias when the hub cannot say, and the hub is not asked again on the next run', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Not found', { status: 404 }))
        const { answeringModel } = await freshModule()

        expect(await answeringModel('lumvika', 'lumvika-smart')).toBe('lumvika-smart')
        expect(await answeringModel('lumvika', 'lumvika-smart')).toBe('lumvika-smart')
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('does not hold a run past two seconds on a hub that hangs', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))
        const { answeringModel } = await freshModule()

        const started = Date.now()
        expect(await answeringModel('lumvika', 'lumvika-smart')).toBe('lumvika-smart')
        expect(Date.now() - started).toBeLessThan(3_000)
    })

    it('is the model itself on any other provider, without asking the hub', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch')
        const { answeringModel } = await freshModule()

        expect(await answeringModel('openrouter', 'openai/gpt-6-sol')).toBe('openai/gpt-6-sol')
        expect(fetchMock).not.toHaveBeenCalled()
    })
})
