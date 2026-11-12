import { describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import { assistantGuard } from './assistant-guard.js'

const app = new Hono()
app.use('/agents/:id', assistantGuard)
app.use('/agents/:id/*', assistantGuard)
app.all('/agents/:id', c => c.json({ reached: true }))
app.all('/agents/:id/*', c => c.json({ reached: true }))

function call(method: string, path: string, body?: unknown) {
    return app.request(path, { method, headers: body === undefined ? undefined : { 'content-type': 'application/json' }, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) })
}

describe('assistantGuard', () => {
    it.each([
        ['GET', '/agents/assistant'],
        ['POST', '/agents/assistant/chat'],
        ['GET', '/agents/assistant/sessions/s1/messages'],
        ['DELETE', '/agents/assistant/sessions/s1'],
        ['GET', '/agents/assistant/runs'],
        ['GET', '/agents/assistant/runs/r1'],
        ['GET', '/agents/assistant/runs/r1/stream'],
        ['POST', '/agents/assistant/runs/r1/cancel'],
        ['POST', '/agents/assistant/chat/'],
    ])('lets %s %s through', async (method, path) => {
        expect((await call(method, path)).status).toBe(200)
    })

    it('lets the hub pin the model and nothing else', async () => {
        expect((await call('PATCH', '/agents/assistant', { connectionId: 'c1', provider: 'openai', model: 'gpt' })).status).toBe(200)
        expect((await call('PATCH', '/agents/assistant', { model: 'gpt', soul: 'hijacked' })).status).toBe(403)
        expect((await call('PATCH', '/agents/assistant', ['model'])).status).toBe(403)
        expect((await call('PATCH', '/agents/assistant', 'not json')).status).toBe(403)
    })

    it.each([
        ['GET', '/agents/assistant/sessions'],
        ['DELETE', '/agents/assistant'],
        ['GET', '/agents/assistant/memories'],
        ['POST', '/agents/assistant/schedules'],
        ['GET', '/agents/assistant/files/read'],
    ])('refuses %s %s', async (method, path) => {
        const response = await call(method, path)
        expect(response.status).toBe(403)
        expect(await response.json()).toEqual({ error: 'The assistant is managed by the engine and cannot be changed' })
    })

    it('leaves every other agent alone', async () => {
        expect((await call('DELETE', '/agents/nova')).status).toBe(200)
        expect((await call('PATCH', '/agents/nova', { soul: 'anything' })).status).toBe(200)
    })
})
