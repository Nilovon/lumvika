import { ASSISTANT_AGENT_ID } from '@lumvika/contracts'
import { Hono } from 'hono'
import { deleteAssistantSession } from '../../agents/assistant-sessions.js'
import { getSession, listSessions, sessionBelongsToAgent } from '../../db/repos/sessions.js'
import { listMessages } from '../../db/repos/messages.js'

export const sessionRoutes = new Hono()

sessionRoutes.get('/', async c => {
    const agentId = c.req.param('id')!
    return c.json({ sessions: await listSessions(agentId) })
})

sessionRoutes.get('/:sid', async c => {
    const agentId = c.req.param('id')!
    const session = await getSession(agentId, c.req.param('sid'))
    if (!session || session.agentId !== agentId) return c.json({ error: 'session not found' }, 404)
    return c.json(session)
})

sessionRoutes.get('/:sid/messages', async c => {
    const agentId = c.req.param('id')!
    const sid = c.req.param('sid')
    if (!(await sessionBelongsToAgent(sid, agentId))) return c.json({ error: 'session not found' }, 404)
    return c.json({ messages: await listMessages(agentId, sid) })
})

// Only the assistant's conversations can be erased: one member's chat with it is theirs to delete. A
// coworker's conversations stay, they are its history.
sessionRoutes.delete('/:sid', async c => {
    if (c.req.param('id') !== ASSISTANT_AGENT_ID) return c.json({ error: 'only a conversation of the assistant can be deleted' }, 403)
    const outcome = await deleteAssistantSession(c.req.param('sid'))
    if (outcome === 'not_found') return c.json({ error: 'session not found' }, 404)
    if (outcome === 'run_in_flight') return c.json({ error: 'a run is still going on this conversation', code: 'run_in_flight' }, 409)
    return c.json({ ok: true })
})
