import { ASSISTANT_AGENT_ID } from '@lumvika/contracts'
import type { MiddlewareHandler } from 'hono'

// The assistant is rewritten from code at every boot and serves every member of the workspace. The
// hub may talk to it, read it, read one conversation it already knows the id of, follow, read and
// stop a run, and pin the workspace default model. Listing its conversations is left out: the hub
// keeps who owns which in its own table and never needs the whole list.
const ASSISTANT_OPEN_ROUTES: Array<{ method: string; path: RegExp }> = [
    { method: 'GET', path: /^\/agents\/assistant$/ },
    { method: 'POST', path: /^\/agents\/assistant\/chat$/ },
    { method: 'GET', path: /^\/agents\/assistant\/sessions\/[^/]+\/messages$/ },
    { method: 'GET', path: /^\/agents\/assistant\/runs$/ },
    { method: 'GET', path: /^\/agents\/assistant\/runs\/[^/]+$/ },
    { method: 'GET', path: /^\/agents\/assistant\/runs\/[^/]+\/stream$/ },
    { method: 'POST', path: /^\/agents\/assistant\/runs\/[^/]+\/cancel$/ },
]

const ASSISTANT_MODEL_FIELDS = new Set(['connectionId', 'provider', 'model'])

async function patchesOnlyTheModel(c: Parameters<MiddlewareHandler>[0]): Promise<boolean> {
    const body = (await c.req.json().catch(() => null)) as unknown
    if (!body || typeof body !== 'object' || Array.isArray(body)) return false
    return Object.keys(body).every(field => ASSISTANT_MODEL_FIELDS.has(field))
}

export const assistantGuard: MiddlewareHandler = async (c, next) => {
    if (c.req.param('id') !== ASSISTANT_AGENT_ID) return next()
    const path = c.req.path.replace(/\/$/, '')
    if (ASSISTANT_OPEN_ROUTES.some(route => route.method === c.req.method && route.path.test(path))) return next()
    if (c.req.method === 'PATCH' && path === `/agents/${ASSISTANT_AGENT_ID}` && (await patchesOnlyTheModel(c))) return next()
    return c.json({ error: 'The assistant is managed by the engine and cannot be changed' }, 403)
}
