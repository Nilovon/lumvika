import { describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import { stewardGuard } from './steward-guard.js'

const app = new Hono()
app.use('/agents/:id', stewardGuard)
app.use('/agents/:id/*', stewardGuard)
app.all('/agents/:id', c => c.json({ reached: true }))
app.all('/agents/:id/*', c => c.json({ reached: true }))

function call(method: string, path: string, body?: string) {
    return app.request(path, { method, headers: body === undefined ? undefined : { 'content-type': 'application/json' }, body })
}

describe('stewardGuard', () => {
    it.each([
        ['GET', '/agents/steward'],
        ['POST', '/agents/steward/chat'],
        ['GET', '/agents/steward/sessions'],
        ['GET', '/agents/steward/sessions/s1/messages'],
        ['GET', '/agents/steward/runs/r1/stream'],
        ['POST', '/agents/steward/runs/r1/cancel'],
        ['GET', '/agents/steward/runs'],
        ['GET', '/agents/steward/runs/r1'],
        ['GET', '/agents/steward/runs/r1/steps'],
        ['POST', '/agents/steward/runs/r1/tasks/t1/cancel'],
        ['GET', '/agents/steward/files/raw'],
        ['PUT', '/agents/steward/files/raw'],
        ['POST', '/agents/steward/files/raw'],
        ['GET', '/agents/steward/files/read'],
        ['DELETE', '/agents/steward/files'],
    ])('lets %s %s through', async (method, path) => {
        expect((await call(method, path)).status).toBe(200)
    })

    it('ignores a trailing slash on an open route', async () => {
        expect((await call('GET', '/agents/steward/sessions/')).status).toBe(200)
        expect((await call('POST', '/agents/steward/chat/')).status).toBe(200)
    })

    it.each([
        ['GET', '/agents/steward/memories'],
        ['POST', '/agents/steward/memories'],
        ['GET', '/agents/steward/skills'],
        ['POST', '/agents/steward/data/query'],
        ['GET', '/agents/steward/triggers'],
        ['POST', '/agents/steward/schedules'],
        ['DELETE', '/agents/steward'],
        ['GET', '/agents/steward/keys'],
        ['POST', '/agents/steward/sessions'],
        ['GET', '/agents/steward/chat'],
        ['GET', '/agents/steward/sessions/s1/messages/extra'],
        ['GET', '/agents/steward/runs/r1/tools'],
        ['GET', '/agents/steward/files'],
        ['PUT', '/agents/steward/files'],
        ['POST', '/agents/steward/files/move'],
        ['POST', '/agents/steward/files/dir'],
        ['GET', '/agents/steward/usage'],
    ])('refuses %s %s with a 403', async (method, path) => {
        const res = await call(method, path)
        expect(res.status).toBe(403)
        expect(await res.json()).toEqual({ error: 'The steward is managed by the engine and cannot be changed' })
    })

    it.each([
        ['an array', '[]'],
        ['null', 'null'],
        ['invalid JSON', '{not json'],
        ['a string', '"model"'],
        ['a field beyond the model', JSON.stringify({ model: 'x', name: 'renamed' })],
    ])('refuses a PATCH whose body is %s', async (_, body) => {
        expect((await call('PATCH', '/agents/steward', body)).status).toBe(403)
    })

    it('allows an empty PATCH', async () => {
        expect((await call('PATCH', '/agents/steward', '{}')).status).toBe(200)
    })

    it('allows a PATCH that only pins the model', async () => {
        expect((await call('PATCH', '/agents/steward', JSON.stringify({ connectionId: 'c', provider: 'lumvika', model: 'lumvika-max' }))).status).toBe(200)
        expect((await call('PATCH', '/agents/steward/', JSON.stringify({ model: 'lumvika-max' }))).status).toBe(200)
    })

    it('refuses a model-only PATCH aimed at a sub-route', async () => {
        expect((await call('PATCH', '/agents/steward/keys', JSON.stringify({ model: 'x' }))).status).toBe(403)
    })

    it('leaves every other agent untouched', async () => {
        for (const [method, path] of [
            ['DELETE', '/agents/scout'],
            ['PATCH', '/agents/scout'],
            ['POST', '/agents/scout/memories'],
            ['GET', '/agents/steward-2/skills'],
        ]) {
            expect((await call(method, path, method === 'PATCH' ? '[]' : undefined)).status).toBe(200)
        }
    })
})
