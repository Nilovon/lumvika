import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { callRows, queryRows } from './functions'
import { selectMany } from './helpers'
import { closeDb, getDb } from './pool'
import type { DbResult } from './result'
import { serviceScope, userScope } from './scope'
import { authUsers } from './schema'
import { deleteRows, insertRow, insertRows } from './writes'

// `issue_touches`: the last touch of each issue by its assignee, by anyone else and by a person's
// comment, exact per issue however much activity the workspace holds. `issue_actor_touches`: the
// same, per actor and action, so the hub can leave out a person who may not use the coworker.
// `issue_run_failures`: a failed run is the coworker's own touch, written once per run, read while it
// is still the assignee's latest event. All three are for the server only.
const service = serviceScope()

async function expectOk<T>(result: Promise<DbResult<T>>): Promise<T> {
    const settled = await result
    if (settled.error) throw new Error(settled.error.message)
    return settled.data
}

const at = (iso: string) => new Date(iso).toISOString()
const instant = (value: string | null | undefined) => (value == null ? value : new Date(value).toISOString())

type IssueTouch = { issue_id: string; assignee_touched_at: string | null; others_touched_at: string | null; person_commented_at: string | null }
type ActorTouch = { issue_id: string; action: string; actor_user_id: string | null; actor_agent_id: string | null; last_at: string }
type RunFailure = { issue_id: string; metadata: { reason?: string } }

describe('the touches of an issue', () => {
    let workspaceId: number
    let admin: string
    const space = randomUUID()
    const writer = randomUUID()
    const scout = randomUUID()
    const project = randomUUID()
    const worked = randomUUID()
    const quiet = randomUUID()
    const unknownWorkspace = () => workspaceId + 1_000_000

    const touches = (issueIds: string[], workspace = workspaceId) => expectOk(callRows<IssueTouch>(service, 'issue_touches', { p_workspace_id: workspace, p_issue_ids: issueIds }))
    const actorTouches = (issueIds: string[], workspace = workspaceId) => expectOk(callRows<ActorTouch>(service, 'issue_actor_touches', { p_workspace_id: workspace, p_issue_ids: issueIds }))
    const runFailures = (issueIds: string[], workspace = workspaceId) => expectOk(callRows<RunFailure>(service, 'issue_run_failures', { p_workspace_id: workspace, p_issue_ids: issueIds }))
    const issueEvent = (issueId: string, fields: { action: string; actor_user_id?: string | null; actor_agent_id?: string | null; created_at?: string; metadata?: Record<string, string | null> }) => ({
        workspace_id: workspaceId,
        project_id: project,
        issue_id: issueId,
        entity_type: 'issue',
        entity_id: issueId,
        ...fields,
    })

    beforeAll(async () => {
        admin = randomUUID()
        await getDb()
            .insert(authUsers)
            .values({ id: admin, name: 'touches-admin', email: `touches-admin-${admin}@example.com` })
        workspaceId = (await expectOk(insertRow(service, 'workspaces', { name: 'Touches test' }, ['id']))).id
        await expectOk(insertRows(service, 'users', { id: admin, workspace_id: workspaceId }))
        await expectOk(insertRows(service, 'workspace_members', { user_id: admin, workspace_id: workspaceId, role: 'admin', box_scope: 'all' }))
        await expectOk(insertRows(service, 'spaces', { id: space, workspace_id: workspaceId, name: 'Here', col_start: 0, row_start: 0, col_end: 3, row_end: 3 }))
        await expectOk(
            insertRows(service, 'agents', [
                { id: writer, workspace_id: workspaceId, space_id: space, name: 'writer' },
                { id: scout, workspace_id: workspaceId, space_id: space, name: 'scout' },
            ]),
        )
        await expectOk(insertRows(service, 'projects', { id: project, workspace_id: workspaceId, key: 'TCH', name: 'Touches', visibility: 'workspace' }))
        await expectOk(
            insertRows(service, 'issues', [
                { id: worked, workspace_id: workspaceId, project_id: project, title: 'worked', status: 'blocked', assignee_agent_id: writer },
                { id: quiet, workspace_id: workspaceId, project_id: project, title: 'quiet', status: 'todo', assignee_agent_id: writer },
            ]),
        )
        await expectOk(
            insertRows(service, 'activity_events', [
                issueEvent(worked, { action: 'issue.created', actor_agent_id: writer, created_at: at('2026-11-01T09:00:00Z') }),
                issueEvent(worked, { action: 'issue.checked_out', actor_agent_id: writer, created_at: at('2026-11-01T10:00:00Z') }),
                issueEvent(worked, { action: 'issue.commented', actor_user_id: admin, created_at: at('2026-11-01T11:00:00Z') }),
                issueEvent(worked, { action: 'issue.commented', actor_agent_id: scout, created_at: at('2026-11-01T12:00:00Z') }),
                issueEvent(worked, { action: 'issue.released', created_at: at('2026-11-01T13:00:00Z') }),
            ]),
        )

        // Far more activity than any window the queue used to read, all on the other issue and newer.
        await expectOk(
            queryRows(
                service,
                sql`insert into public.activity_events (workspace_id, project_id, issue_id, entity_type, entity_id, action, actor_user_id, created_at)
                    select ${workspaceId}, ${project}::uuid, ${quiet}::uuid, 'issue', ${quiet}::uuid, 'issue.updated', ${admin}::uuid, '2026-11-02T00:00:00Z'::timestamptz + n * interval '1 second'
                    from generate_series(1, 2500) as n`,
            ),
        )
    })

    afterAll(closeDb)

    describe('issue_touches', () => {
        it('counts the checkout as the last touch of the assignee, not its own creation', async () => {
            const [touch] = await touches([worked])
            expect(instant(touch.assignee_touched_at)).toBe(at('2026-11-01T10:00:00Z'))
        })

        it('counts another coworker commenting as someone else, not the system releasing it', async () => {
            const [touch] = await touches([worked])
            expect(instant(touch.others_touched_at)).toBe(at('2026-11-01T12:00:00Z'))
        })

        it('keeps the last comment of a person apart', async () => {
            const [touch] = await touches([worked])
            expect(instant(touch.person_commented_at)).toBe(at('2026-11-01T11:00:00Z'))
        })

        it('keeps the old activity of an issue next to one with thousands of newer events', async () => {
            const touch = (await touches([worked, quiet])).find(row => row.issue_id === worked)
            expect(instant(touch?.assignee_touched_at)).toBe(at('2026-11-01T10:00:00Z'))
        })

        it('reads the newest event of the busy issue', async () => {
            const [touch] = await touches([quiet])
            expect(instant(touch.others_touched_at)).toBe(at('2026-11-02T00:41:40Z'))
        })

        it('answers null for an issue its assignee never touched', async () => {
            const [touch] = await touches([quiet])
            expect(touch.assignee_touched_at).toBeNull()
        })

        it('answers nothing to another workspace', async () => {
            expect(await touches([worked], unknownWorkspace())).toHaveLength(0)
        })
    })

    describe('issue_actor_touches', () => {
        it('keeps the person who commented apart from everyone else', async () => {
            const touch = (await actorTouches([worked])).find(row => row.action === 'issue.commented' && row.actor_user_id === admin)
            expect(instant(touch?.last_at)).toBe(at('2026-11-01T11:00:00Z'))
        })

        it('keeps the other coworker who commented', async () => {
            const touch = (await actorTouches([worked])).find(row => row.action === 'issue.commented' && row.actor_agent_id === scout)
            expect(instant(touch?.last_at)).toBe(at('2026-11-01T12:00:00Z'))
        })

        it('leaves out an action that is no touch', async () => {
            expect((await actorTouches([worked])).filter(row => row.action === 'issue.released')).toHaveLength(0)
        })

        it('keeps the old activity of an issue next to one with thousands of newer events', async () => {
            const touch = (await actorTouches([worked, quiet])).find(row => row.issue_id === worked && row.action === 'issue.checked_out')
            expect(instant(touch?.last_at)).toBe(at('2026-11-01T10:00:00Z'))
        })

        it('answers nothing to another workspace', async () => {
            expect(await actorTouches([worked], unknownWorkspace())).toHaveLength(0)
        })
    })

    describe('a failed run', () => {
        beforeAll(async () => {
            await expectOk(
                insertRows(service, 'activity_events', [
                    issueEvent(quiet, { action: 'issue.run_failed', actor_agent_id: writer, metadata: { reason: 'no_model', runId: 'run-1', sessionId: null }, created_at: at('2026-11-03T08:00:00Z') }),
                    issueEvent(worked, { action: 'issue.run_failed', actor_agent_id: writer, metadata: { reason: 'failed', runId: 'run-0', sessionId: null }, created_at: at('2026-11-01T09:30:00Z') }),
                ]),
            )
        })

        it('is a touch of the coworker that ran it', async () => {
            const touch = (await actorTouches([quiet])).find(row => row.action === 'issue.run_failed' && row.actor_agent_id === writer)
            expect(instant(touch?.last_at)).toBe(at('2026-11-03T08:00:00Z'))
        })

        it('is read with its reason while it is the latest event of the assignee', async () => {
            const [failure] = await runFailures([quiet])
            expect(failure.metadata.reason).toBe('no_model')
        })

        it('is not read once the assignee did something after it', async () => {
            expect(await runFailures([worked])).toHaveLength(0)
        })

        it('is written once per run', async () => {
            const { error } = await insertRows(service, 'activity_events', issueEvent(quiet, { action: 'issue.run_failed', actor_agent_id: writer, metadata: { reason: 'failed', runId: 'run-1' } }))
            expect(error?.code).toBe('23505')
        })

        it('is read by no other workspace', async () => {
            expect(await runFailures([quiet], unknownWorkspace())).toHaveLength(0)
        })
    })

    // There is no `service_role` here: the service scope, the owner connection, is what calls them,
    // and the tests above already run through it.
    describe('a signed-in user', () => {
        it.each(['issue_touches', 'issue_actor_touches', 'issue_run_failures'])('cannot call %s', async name => {
            const { error } = await callRows(userScope(admin), name, { p_workspace_id: workspaceId, p_issue_ids: [worked] })
            expect(error?.code).toBe('42501')
        })
    })

    it('loses the activity with the project, so no touch outlives its issue', async () => {
        await expectOk(deleteRows(service, 'projects', { id: project }))
        expect((await selectMany(service, 'activity_events', ['id'], { workspace_id: workspaceId })).data).toHaveLength(0)
    })
})
