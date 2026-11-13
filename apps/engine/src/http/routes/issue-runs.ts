import { Hono } from 'hono'
import { issueRunRequestSchema } from '@lumvika/contracts'
import { agentExists } from '../../agents/loader.js'
import { fireIssueRun } from '../../runtime/issue-runner.js'

export const issueRunRoutes = new Hono()

// Always answered 200 for a known request, started or not: a 404 means to the hub that this engine
// predates issue runs, and it stops asking.
issueRunRoutes.post('/', async c => {
    const agentId = c.req.param('id')!
    const parsed = issueRunRequestSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid issue run request' }, 400)
    if (!agentExists(agentId)) return c.json({ started: false, reason: 'not_found' })
    return c.json(await fireIssueRun(agentId, parsed.data))
})
