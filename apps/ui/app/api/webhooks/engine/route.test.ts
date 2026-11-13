import { ASSISTANT_AGENT_ID, STEWARD_AGENT_ID } from '@lumvika/contracts'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { resolveWorkspaceMemberEmail, resolveWorkspaceOwner } from '@/app/api/_services/workspace-owner.service'
import { ensureSessionRow } from '@/app/api/_services/chat.service'
import { sendIncidentResolvedEmail, sendNotificationEmail } from '@lumvika/cloud/email'
import { loadPresence } from '@/app/api/_services/presence.service'
import { captureServer } from '@lumvika/analytics/server'
import { generateRunTitle } from '@/lib/ai/generate-run-title'
import { releaseRunCheckouts } from '@/app/api/_services/work/work-queue.service'
import type { DbCall } from '@/test/db-fake'
import { POST } from './route'

const db = await vi.hoisted(async () => (await import('@/test/db-fake')).fakeDb())
vi.mock('@/lib/db', async importOriginal => ({ ...(await importOriginal<object>()), ...db.helpers }))
vi.mock('@trigger.dev/sdk/v3', async () => (await import('@/test/trigger-sdk')).triggerSdkMock())
vi.mock('@lumvika/analytics/server', () => ({ captureServer: vi.fn(), deterministicUuid: vi.fn((seed: string) => seed) }))
vi.mock('@/app/api/_services/workspace-owner.service', () => ({ resolveWorkspaceOwner: vi.fn().mockResolvedValue(null), resolveWorkspaceMemberEmail: vi.fn().mockResolvedValue(null) }))
vi.mock('@lumvika/cloud/billing.server', () => ({ extendTrial: vi.fn(), subscriptionHasCard: vi.fn() }))
vi.mock('@/app/api/_services/chat.service', () => ({ ensureSessionRow: vi.fn() }))
vi.mock('@/app/api/_services/presence.service', () => ({ loadPresence: vi.fn().mockResolvedValue([]) }))
vi.mock('@lumvika/cloud/email', () => ({ sendNotificationEmail: vi.fn(), sendIncidentResolvedEmail: vi.fn(), BANNER_WARM_INLINE_MS: 0, emailBoardBanner: vi.fn().mockResolvedValue(undefined), buildUnsubscribeUrl: (userId: string) => `https://app.lumvika.com/unsubscribe?u=${userId}`, pushNotification: vi.fn() }))
vi.mock('@lumvika/cloud/engines', () => ({ claimPoolEngine: vi.fn() }))
const afterTasks = vi.hoisted(() => [] as Promise<unknown>[])
vi.mock('next/server', async importOriginal => ({ ...(await importOriginal<typeof import('next/server')>()), after: (task: () => Promise<unknown>) => void afterTasks.push(task()) }))
vi.mock('@/lib/ai/generate-run-title', () => ({ generateRunTitle: vi.fn() }))
// The session is retitled after the response, so a test reads it once those tasks settled.
const afterResponse = () => Promise.all(afterTasks.splice(0))
vi.mock('@/app/api/_services/capacity.service', () => ({ assertEngineEntitlement: vi.fn() }))
vi.mock('@/app/api/_services/work/work-queue.service', () => ({ releaseRunCheckouts: vi.fn().mockResolvedValue(0) }))
vi.mock('@/lib/engine/client', () => ({ listConnections: vi.fn(), listSchedules: vi.fn() }))
// Notification emails are paused in production; the incident tests describe what leaves once they resume.
const emailFlags = vi.hoisted(() => ({ paused: false }))
vi.mock('@/lib/notifications/prefs', async importOriginal => ({
    ...(await importOriginal<typeof import('@/lib/notifications/prefs')>()),
    get NOTIFICATION_EMAILS_PAUSED() {
        return emailFlags.paused
    },
}))

const BOX_KEY = 'box-key-of-workspace-7'
const WORKSPACE_ID = 7
const OTHER_WORKSPACE_ID = 99
let sandbox = true

type AgentRow = { id: string; name: string; space_id: string; workspace_id: number; engine_agent_id: string }

const AGENTS: AgentRow[] = [
    { id: 'agent-own', name: 'Scout', space_id: 'space-1', workspace_id: WORKSPACE_ID, engine_agent_id: 'engine-own' },
    { id: 'agent-foreign', name: 'Spy', space_id: 'space-9', workspace_id: OTHER_WORKSPACE_ID, engine_agent_id: 'engine-foreign' },
]

const WRITES: ReadonlySet<DbCall['helper']> = new Set(['insertRows', 'insertRow', 'updateRows', 'upsertRows', 'deleteRows'])
const isWrite = (call: DbCall) => WRITES.has(call.helper)

// The filters a call carries, wherever its helper takes them.
function filtersOf(call: DbCall): Record<string, unknown> {
    if (call.helper === 'deleteRows') return call.args[0] as Record<string, unknown>
    if (call.helper === 'updateRows') return call.args[1] as Record<string, unknown>
    if (call.helper.endsWith('WithJoins')) return call.args[2] as Record<string, unknown>
    return (call.args[1] ?? {}) as Record<string, unknown>
}

const callsOn = (table: string) => db.calls.filter(call => call.table === table)
const readsOn = (table: string) => callsOn(table).filter(call => !isWrite(call))
// The payload of every insert/update/upsert made on `table`, and the filters of every delete.
const writes = (table: string) =>
    callsOn(table)
        .filter(isWrite)
        .map(call => ({ helper: call.helper, payload: call.helper === 'deleteRows' ? undefined : call.args[0], filters: call.helper === 'deleteRows' || call.helper === 'updateRows' ? filtersOf(call) : undefined }))

const MEMBERS = ['user-1', 'user-2']
let session: { id: string; source: string; title?: string; automation_name?: string | null } | null = null
let participants: string[] = []
let prefsOf: Record<string, unknown> = {}
let incidentOpens = true
let resolvedUsers: string[] = []

function resolve(call: DbCall) {
    const { table } = call
    const filters = filtersOf(call)
    if (table === 'engine_pool') {
        if (filters.engine_api_key !== BOX_KEY) return { data: null }
        return { data: { claimed_by_workspace_id: WORKSPACE_ID, workspace: { id: WORKSPACE_ID, is_sandbox: sandbox } } }
    }
    if (table === 'agents') {
        const match = AGENTS.find(agent => agent.workspace_id === filters.workspace_id && agent.engine_agent_id === filters.engine_agent_id)
        return { data: match ? { id: match.id, name: match.name, space_id: match.space_id } : null }
    }
    if (table === 'notifications') return { data: call.helper === 'insertRow' ? { id: 'notification-1' } : [{ id: 'notification-1' }] }
    if (table === 'sessions') {
        if (call.helper === 'updateRows') return { data: session ? [{ id: session.id }] : [] }
        if (!isWrite(call)) return { data: session }
    }
    if (table === 'session_participants' && !isWrite(call)) return { data: participants.map(user_id => ({ user_id })) }
    if (table === 'workspace_members') {
        const asked = filters.user_id
        if (asked) return { data: MEMBERS.includes(asked as string) ? { user_id: asked } : null }
        return { data: MEMBERS.map(user_id => ({ user_id, role: 'member', box_scope: 'all' })) }
    }
    if (table === 'spaces') return { data: { workspace_id: WORKSPACE_ID, visibility: 'workspace' } }
    if (table === 'space_members') return { data: [] }
    if (table === 'users' && !isWrite(call)) {
        const asked = filters.id
        if (typeof asked === 'string') return { data: { email_notification_prefs: prefsOf[asked] ?? null } }
        return { data: MEMBERS.map(id => ({ id, email_notification_prefs: prefsOf[id] ?? null })) }
    }
    if (table === 'open_notification_incident') return { data: incidentOpens }
    if (table === 'resolve_notification_incidents') return { data: resolvedUsers }
    if (table === 'workspace_getting_started') return { data: [] }
    // The email of an auth user, read with raw SQL: the one string bound into it is the user id.
    if (call.helper === 'queryRows') {
        const userId = (call.args[0] as { queryChunks: unknown[] }).queryChunks.find(chunk => typeof chunk === 'string')
        return { data: userId ? [{ email: `${userId}@lumvika.test`, is_anonymous: false }] : [] }
    }
    return undefined
}

function request(body: unknown, authorization: string | null = `Bearer ${BOX_KEY}`) {
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (authorization) headers.authorization = authorization
    return new Request('https://lumvika.test/api/webhooks/engine', { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) })
}

function notification(overrides: Record<string, unknown> = {}) {
    return { event: 'agent.notification', kind: 'info', agentId: 'engine-own', sessionId: 'engine-session', runId: 'run-1', message: 'Done with the report', timestamp: '2026-09-30T10:00:00.000Z', ...overrides }
}

describe('POST /api/webhooks/engine', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        sandbox = true
        session = null
        participants = []
        prefsOf = {}
        incidentOpens = true
        resolvedUsers = []
        emailFlags.paused = false
        db.reset()
        db.answer(resolve)
        vi.mocked(sendNotificationEmail).mockResolvedValue({ ok: true, id: 'email-1' })
    })

    it.each([
        ['no authorization header', null],
        ['an empty bearer', 'Bearer '],
        ['a non bearer scheme', `Basic ${BOX_KEY}`],
    ])('answers 401 with %s and reads nothing', async (_label, authorization) => {
        const response = await POST(request(notification(), authorization))

        expect(response.status).toBe(401)
        expect(db.calls).toHaveLength(0)
    })

    it('answers 400 on a body that is not JSON', async () => {
        const response = await POST(request('{not json'))

        expect(response.status).toBe(400)
    })

    it('answers 400 on a payload that is neither a getting-started event nor a notification', async () => {
        const response = await POST(request(notification({ message: '' })))

        expect(response.status).toBe(400)
        expect(callsOn('notifications')).toHaveLength(0)
    })

    describe('getting-started events', () => {
        it('answers 401 for a token that names no machine and records nothing', async () => {
            const response = await POST(request({ event: 'agent.schedule.created' }, 'Bearer forged-key'))

            expect(response.status).toBe(401)
            expect(filtersOf(readsOn('engine_pool')[0]).engine_api_key).toBe('forged-key')
            expect(writes('workspace_getting_started')).toHaveLength(0)
        })

        it('makes the member who asked for a schedule in a chat follow its coworker', async () => {
            const response = await POST(request({ event: 'agent.schedule.created', agentId: 'engine-own', metadata: { scheduleSlug: 'weekly', authorId: 'user-2' } }))

            expect(response.status).toBe(202)
            expect(writes('users')).toEqual([expect.objectContaining({ payload: { email_notification_prefs: expect.objectContaining({ coworkers: { 'agent-own': { mode: 'default', follow: true } } }) } })])
        })

        it('never overrides a member who stopped following, nor follows for someone outside the workspace', async () => {
            prefsOf = { 'user-2': { version: 2, coworkers: { 'agent-own': { mode: 'default', follow: false } } } }
            await POST(request({ event: 'agent.trigger.created', agentId: 'engine-own', metadata: { triggerSlug: 'lead', authorId: 'user-2' } }))
            await POST(request({ event: 'agent.trigger.created', agentId: 'engine-own', metadata: { triggerSlug: 'lead', authorId: 'stranger' } }))

            expect(writes('users')).toEqual([])
        })

        it('records the step on the workspace the token names', async () => {
            const response = await POST(request({ event: 'box.connection.connected' }))

            expect(response.status).toBe(202)
            const [written, reported] = writes('workspace_getting_started')
            expect(written).toEqual(expect.objectContaining({ helper: 'upsertRows', payload: [{ workspace_id: WORKSPACE_ID, item: 'ai_provider' }] }))
            expect(reported).toEqual(expect.objectContaining({ helper: 'updateRows', payload: { reported_at: expect.any(String) } }))
        })
    })

    describe('notifications', () => {
        it('answers 401 for a token that names no machine and stores nothing', async () => {
            const response = await POST(request(notification(), 'Bearer forged-key'))

            expect(response.status).toBe(401)
            expect(callsOn('agents')).toHaveLength(0)
            expect(writes('notifications')).toHaveLength(0)
        })

        it('looks the agent up inside the workspace the token names', async () => {
            const response = await POST(request(notification()))

            expect(response.status).toBe(202)
            const [lookup] = readsOn('agents')
            expect(filtersOf(lookup)).toMatchObject({ workspace_id: WORKSPACE_ID, engine_agent_id: 'engine-own' })
            expect(writes('notifications')).toEqual([expect.objectContaining({ payload: expect.objectContaining({ workspace_id: WORKSPACE_ID, agent_id: 'agent-own', space_id: 'space-1' }) })])
        })

        it('never attaches an agent of another workspace to the notification', async () => {
            const response = await POST(request(notification({ agentId: 'engine-foreign' })))

            expect(response.status).toBe(202)
            expect(writes('notifications')).toEqual([expect.objectContaining({ payload: expect.objectContaining({ workspace_id: WORKSPACE_ID, agent_id: null, space_id: null }) })])
        })

        it('never mirrors a session for an agent of another workspace', async () => {
            const response = await POST(request(notification({ event: 'agent.session.created', agentId: 'engine-foreign' })))

            expect(response.status).toBe(202)
            expect(ensureSessionRow).not.toHaveBeenCalled()
        })

        it('resolves the originating agent inside the same workspace only', async () => {
            const response = await POST(request(notification({ event: 'agent.session.created', originAgentId: 'engine-foreign', source: 'delegate' })))

            expect(response.status).toBe(202)
            const originLookup = readsOn('agents')[1]
            expect(filtersOf(originLookup).workspace_id).toBe(WORKSPACE_ID)
            expect(ensureSessionRow).toHaveBeenCalledWith('agent-own', 'engine-session', 'Scheduled run', expect.objectContaining({ originAgentId: null }))
        })

        // A workspace of several members used to credit every run to its owner.
        it('credits a finished chat run to the member who sent the message', async () => {
            sandbox = false
            vi.mocked(resolveWorkspaceMemberEmail).mockResolvedValueOnce('member@lumvika.test')

            await POST(request(notification({ event: 'agent.message.completed', kind: 'done', metadata: { authorId: 'user-2' } })))

            expect(resolveWorkspaceMemberEmail).toHaveBeenCalledWith(WORKSPACE_ID, 'user-2')
            expect(captureServer).toHaveBeenCalledWith('member@lumvika.test', 'agent_run_completed', expect.any(Object), expect.any(Object))
        })

        it('reports nothing to analytics for an issue run, which nobody typed', async () => {
            sandbox = false
            await POST(request(notification({ event: 'agent.message.completed', kind: 'done', source: 'issue', metadata: {} })))
            expect(captureServer).not.toHaveBeenCalled()
        })

        it('lets go of every issue a run still held once it ended, and only then', async () => {
            await POST(request(notification({ event: 'agent.message.completed', kind: 'done', runId: 'run-9' })))
            await afterResponse()
            expect(releaseRunCheckouts).toHaveBeenCalledWith({ workspaceId: WORKSPACE_ID }, 'run-9')

            vi.mocked(releaseRunCheckouts).mockClear()
            await POST(request(notification({ event: 'agent.notification', kind: 'question', runId: 'run-9' })))
            await POST(request(notification({ event: 'agent.message.completed', kind: 'done', runId: null })))
            await afterResponse()
            expect(releaseRunCheckouts).not.toHaveBeenCalled()
        })

        it('answers the engine before the release is done, so a slow release cannot run past its timeout', async () => {
            let finish!: () => void
            vi.mocked(releaseRunCheckouts).mockImplementationOnce(() => new Promise(resolve => (finish = () => resolve(1))))
            const response = await POST(request(notification({ event: 'agent.message.completed', kind: 'done', runId: 'run-9' })))
            expect(response.status).toBe(202)
            expect(releaseRunCheckouts).toHaveBeenCalledTimes(1)
            finish()
            await afterResponse()
        })

        it('still stores the notification when the release fails', async () => {
            vi.spyOn(console, 'error').mockImplementation(() => undefined)
            vi.mocked(releaseRunCheckouts).mockRejectedValueOnce(new Error('db down'))
            const response = await POST(request(notification({ event: 'agent.schedule.completed', kind: 'done', runId: 'run-9' })))
            expect(response.status).toBe(202)
            await afterResponse()
        })

        it('falls back to the owner when the engine names no author', async () => {
            sandbox = false
            vi.mocked(resolveWorkspaceOwner).mockResolvedValueOnce({ userId: 'user-1', email: 'owner@lumvika.test' })

            await POST(request(notification({ event: 'agent.message.completed', kind: 'done', metadata: {} })))

            expect(resolveWorkspaceMemberEmail).not.toHaveBeenCalled()
            expect(captureServer).toHaveBeenCalledWith('owner@lumvika.test', 'agent_run_completed', expect.any(Object), expect.any(Object))
        })

        it('routes a question to the member waiting on it, not to the whole workspace', async () => {
            session = { id: 'session-1', source: 'dashboard' }
            participants = ['user-2']

            await POST(request(notification({ kind: 'question' })))

            expect(writes('notifications')).toEqual([expect.objectContaining({ payload: expect.objectContaining({ source: 'dashboard', recipients: { 'user-2': 'mine' } }) })])
        })

        it('hands a scheduled task nobody follows to the owner, who keeps it', async () => {
            sandbox = false
            session = { id: 'session-1', source: 'schedule' }
            vi.mocked(resolveWorkspaceOwner).mockResolvedValue({ userId: 'user-1', email: 'owner@lumvika.test' })

            await POST(request(notification({ event: 'agent.schedule.completed', kind: 'error', source: 'schedule', metadata: { scheduleSlug: 'weekly' } })))

            expect(writes('notifications')).toEqual([expect.objectContaining({ payload: expect.objectContaining({ recipients: { 'user-1': 'followed' } }) })])
            expect(writes('users')).toEqual([expect.objectContaining({ payload: { email_notification_prefs: expect.objectContaining({ coworkers: { 'agent-own': { mode: 'default', follow: true } } }) } })])
        })

        it('emails a member who is away once per incident, saying why', async () => {
            sandbox = false
            session = { id: 'session-1', source: 'dashboard' }
            participants = ['user-2']

            await POST(request(notification({ kind: 'question' })))
            incidentOpens = false
            await POST(request(notification({ kind: 'question' })))

            expect(sendNotificationEmail).toHaveBeenCalledTimes(1)
            expect(sendNotificationEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'user-2@lumvika.test', kind: 'question', reason: 'You started this run.' }))
            expect(callsOn('open_notification_incident')[0].args[0]).toEqual({ p_user_id: 'user-2', p_source_key: 'engine-own:session:engine-session' })
        })

        it('emails nobody while notification emails are paused, and still writes the notification', async () => {
            sandbox = false
            emailFlags.paused = true
            session = { id: 'session-1', source: 'dashboard' }
            participants = ['user-2']

            await POST(request(notification({ kind: 'question' })))

            expect(writes('notifications')).toHaveLength(1)
            expect(sendNotificationEmail).not.toHaveBeenCalled()
            expect(callsOn('open_notification_incident')).toHaveLength(0)
        })

        it('drops the incident when its email never left, so the next failure can try again', async () => {
            sandbox = false
            session = { id: 'session-1', source: 'dashboard' }
            participants = ['user-2']
            vi.mocked(sendNotificationEmail).mockResolvedValue({ ok: false, error: 'boom' })

            await POST(request(notification({ kind: 'question' })))

            const dropped = writes('notification_incidents').filter(write => write.helper === 'deleteRows')
            expect(dropped).toHaveLength(1)
            expect(dropped[0].filters).toMatchObject({ user_id: 'user-2', source_key: 'engine-own:session:engine-session' })
        })

        it('keeps the incident open once its email left', async () => {
            sandbox = false
            session = { id: 'session-1', source: 'dashboard' }
            participants = ['user-2']

            await POST(request(notification({ kind: 'question' })))

            expect(sendNotificationEmail).toHaveBeenCalledTimes(1)
            expect(callsOn('notification_incidents')).toHaveLength(0)
        })

        it('emails nobody who has the app open', async () => {
            sandbox = false
            session = { id: 'session-1', source: 'dashboard' }
            participants = ['user-2']
            vi.mocked(loadPresence).mockResolvedValueOnce([{ user_id: 'user-2', last_seen_at: new Date().toISOString() }])

            await POST(request(notification({ kind: 'question' })))

            expect(sendNotificationEmail).not.toHaveBeenCalled()
            expect(callsOn('open_notification_incident')).toHaveLength(0)
        })

        it('titles a finished scheduled run after what it did and keeps the routine name', async () => {
            session = { id: 'session-1', source: 'schedule', title: 'Daily missions apply', automation_name: 'Daily missions apply' }
            vi.mocked(generateRunTitle).mockResolvedValue({ title: '4 applications sent: Doctolib, Qonto', nothingToReport: false })

            await POST(request(notification({ event: 'agent.schedule.completed', kind: 'done', source: 'schedule', metadata: { scheduleSlug: 'daily', finalText: 'I sent 4 applications…' } })))
            await afterResponse()

            expect(generateRunTitle).toHaveBeenCalledWith('Daily missions apply', 'I sent 4 applications…', false)
            const update = writes('sessions').find(write => write.payload && 'outcome' in (write.payload as object))
            expect(update?.payload).toEqual({ automation_name: 'Daily missions apply', outcome: 'done', title: '4 applications sent: Doctolib, Qonto' })
        })

        it('marks a run that found nothing and one that failed', async () => {
            session = { id: 'session-1', source: 'schedule', title: 'Daily missions apply', automation_name: 'Daily missions apply' }
            vi.mocked(generateRunTitle).mockResolvedValueOnce({ title: 'No new mission', nothingToReport: true }).mockResolvedValueOnce(null)

            await POST(request(notification({ event: 'agent.schedule.completed', kind: 'done', source: 'schedule', metadata: { scheduleSlug: 'daily', finalText: 'Nothing new today' } })))
            await POST(request(notification({ event: 'agent.schedule.completed', kind: 'error', source: 'schedule', metadata: { scheduleSlug: 'daily', error: 'LinkedIn session expired' } })))
            await afterResponse()

            const outcomes = writes('sessions').filter(write => write.payload && 'outcome' in (write.payload as object)).map(write => write.payload)
            expect(outcomes).toEqual([
                { automation_name: 'Daily missions apply', outcome: 'nothing', title: 'No new mission' },
                { automation_name: 'Daily missions apply', outcome: 'failed' },
            ])
        })

        it('leaves the title of a run from an engine that sent no answer', async () => {
            session = { id: 'session-1', source: 'schedule', title: 'Daily missions apply', automation_name: null }

            await POST(request(notification({ event: 'agent.schedule.completed', kind: 'done', source: 'schedule', metadata: { scheduleSlug: 'daily' } })))
            await afterResponse()

            expect(generateRunTitle).not.toHaveBeenCalled()
            expect(writes('sessions').map(write => write.payload)).toContainEqual({ automation_name: 'Daily missions apply', outcome: 'done' })
        })

        it('tells whoever was emailed about a broken schedule that it works again', async () => {
            sandbox = false
            session = { id: 'session-1', source: 'schedule' }
            resolvedUsers = ['user-1']

            await POST(request(notification({ event: 'agent.schedule.completed', kind: 'done', source: 'schedule', metadata: { scheduleSlug: 'weekly' } })))

            expect(callsOn('resolve_notification_incidents').map(call => call.args[0])).toEqual([{ p_source_key: 'engine-own:schedule:weekly' }, { p_source_key: 'engine-own:session:engine-session' }])
            expect(sendIncidentResolvedEmail).toHaveBeenCalledTimes(1)
            expect(sendIncidentResolvedEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'user-1@lumvika.test', sourceLabel: 'Schedule "weekly"' }))
        })

        it('tells nobody who has left the workspace that it works again', async () => {
            sandbox = false
            session = { id: 'session-1', source: 'schedule' }
            resolvedUsers = ['user-1', 'user-9']

            await POST(request(notification({ event: 'agent.schedule.completed', kind: 'done', source: 'schedule', metadata: { scheduleSlug: 'weekly' } })))

            expect(sendIncidentResolvedEmail).toHaveBeenCalledTimes(1)
            expect(sendIncidentResolvedEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'user-1@lumvika.test' }))
        })

        it('tells nobody who unsubscribed that it works again', async () => {
            sandbox = false
            session = { id: 'session-1', source: 'schedule' }
            resolvedUsers = ['user-1']
            prefsOf = { 'user-1': { version: 2, email: false } }

            await POST(request(notification({ event: 'agent.schedule.completed', kind: 'done', source: 'schedule', metadata: { scheduleSlug: 'weekly' } })))

            expect(sendIncidentResolvedEmail).not.toHaveBeenCalled()
        })

        it('treats a steward event as a no-op', async () => {
            const response = await POST(request(notification({ agentId: STEWARD_AGENT_ID, event: 'agent.message.completed', kind: 'done' })))

            expect(response.status).toBe(202)
            expect(callsOn('agents')).toHaveLength(0)
            expect(callsOn('notifications')).toHaveLength(0)
            expect(callsOn('sessions')).toHaveLength(0)
        })

        it('stores nothing of an assistant run, whose text belongs to one person', async () => {
            const response = await POST(request(notification({ agentId: ASSISTANT_AGENT_ID, event: 'agent.message.completed', kind: 'done', message: 'a private answer' })))

            expect(response.status).toBe(202)
            expect(callsOn('notifications')).toHaveLength(0)
            expect(callsOn('sessions')).toHaveLength(0)
        })
    })
})
