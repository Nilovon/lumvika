import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'

const calls = vi.hoisted(() => [] as string[])

vi.mock('../../agents/loader.js', () => ({ agentExists: () => true }))
vi.mock('../../desktop/takeover.js', () => ({
    activeTakeovers: () => [],
    startTakeover: async () => {},
    finishTakeover: async (id: string) => {
        calls.push(`finish:${id}`)
        return { url: null }
    },
    handBackTakeover: async (id: string) => {
        calls.push(`hand back:${id}`)
        return { url: 'https://site.example/inbox', open: true }
    },
}))

const { agentDesktopRoutes } = await import('./desktop.js')
const app = new Hono().route('/agents/:id/desktop', agentDesktopRoutes)

describe('DELETE /agents/:id/desktop/takeover', () => {
    it('closes the browser, or leaves it on the screen when the person hands it back to the run', async () => {
        const closed = await app.request('/agents/a1/desktop/takeover', { method: 'DELETE' })
        expect(await closed.json()).toEqual({ url: null })
        const kept = await app.request('/agents/a1/desktop/takeover?keepOpen=1', { method: 'DELETE' })
        expect(await kept.json()).toEqual({ url: 'https://site.example/inbox', open: true })
        expect(calls).toEqual(['finish:a1', 'hand back:a1'])
    })
})
