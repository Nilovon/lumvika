import type { MiddlewareHandler } from 'hono'
import { env } from '../config/env.js'

export const auth: MiddlewareHandler = async (c, next) => {
    const key = env().RERUN_API_KEY
    if (!key) return next()
    const header = c.req.header('authorization') ?? ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : header
    if (token !== key) return c.json({ error: 'Unauthorized' }, 401)
    return next()
}
