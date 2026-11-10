import { STEWARD_AGENT_ID } from '@lumvika/contracts'
import type { MiddlewareHandler } from 'hono'

// The steward is rewritten from code at every boot, so nothing about it is editable over HTTP but
// its model: the hub may talk to it, read it, its conversations and its runs, stop a run or one of
// its delegated tasks, hand it the files of a chat message and pin the model it runs on, and that
// is all.
const STEWARD_OPEN_ROUTES: Array<{ method: string; path: RegExp }> = [
    { method: 'GET', path: /^\/agents\/steward$/ },
    { method: 'POST', path: /^\/agents\/steward\/chat$/ },
    { method: 'GET', path: /^\/agents\/steward\/sessions$/ },
    { method: 'GET', path: /^\/agents\/steward\/sessions\/[^/]+\/messages$/ },
    { method: 'GET', path: /^\/agents\/steward\/runs\/[^/]+\/stream$/ },
    { method: 'POST', path: /^\/agents\/steward\/runs\/[^/]+\/cancel$/ },
    { method: 'GET', path: /^\/agents\/steward\/runs$/ },
    { method: 'GET', path: /^\/agents\/steward\/runs\/[^/]+$/ },
    { method: 'GET', path: /^\/agents\/steward\/runs\/[^/]+\/steps$/ },
    { method: 'POST', path: /^\/agents\/steward\/runs\/[^/]+\/tasks\/[^/]+\/cancel$/ },
    { method: 'GET', path: /^\/agents\/steward\/files\/raw$/ },
    { method: 'PUT', path: /^\/agents\/steward\/files\/raw$/ },
    { method: 'POST', path: /^\/agents\/steward\/files\/raw$/ },
    { method: 'GET', path: /^\/agents\/steward\/files\/read$/ },
    { method: 'DELETE', path: /^\/agents\/steward\/files$/ },
]

// The only fields ensureSteward carries over a reboot, so the only ones worth accepting.
const STEWARD_MODEL_FIELDS = new Set(['connectionId', 'provider', 'model'])

async function patchesOnlyTheModel(c: Parameters<MiddlewareHandler>[0]): Promise<boolean> {
    const body = (await c.req.json().catch(() => null)) as unknown
    if (!body || typeof body !== 'object' || Array.isArray(body)) return false
    return Object.keys(body).every(field => STEWARD_MODEL_FIELDS.has(field))
}

export const stewardGuard: MiddlewareHandler = async (c, next) => {
    if (c.req.param('id') !== STEWARD_AGENT_ID) return next()
    const path = c.req.path.replace(/\/$/, '')
    if (STEWARD_OPEN_ROUTES.some(route => route.method === c.req.method && route.path.test(path))) return next()
    if (c.req.method === 'PATCH' && path === `/agents/${STEWARD_AGENT_ID}` && (await patchesOnlyTheModel(c))) return next()
    return c.json({ error: 'The steward is managed by the engine and cannot be changed' }, 403)
}
