import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { callColumn, queryRows } from './functions'
import { selectMany, selectSingle } from './helpers'
import { closeDb, getDb } from './pool'
import type { DbResult } from './result'
import { anonScope, serviceScope, userScope } from './scope'
import { authUsers } from './schema'
import { deleteRows, insertRow, insertRows, updateRows } from './writes'

// The work layer (projects, issues, channels, assistant chats, teams) seen from an admin, a member
// scoped to `all`, a member scoped to `assigned`, someone of another workspace and a visitor; the
// issue numbers; the reporting line of coworkers. Projects: Open is open to the workspace, Closed is
// restricted with nobody named, Shared is restricted with the `all` member named with `use`,
// Assigned is restricted with the `assigned` member named with `manage`.
const service = serviceScope()

async function expectOk<T>(result: Promise<DbResult<T>>): Promise<T> {
    const settled = await result
    if (settled.error) throw new Error(settled.error.message)
    return settled.data
}

async function createUser(label: string) {
    const id = randomUUID()
    await getDb()
        .insert(authUsers)
        .values({ id, name: label, email: `${label}-${id}@example.com` })
    return id
}

const sortedUnique = <T>(values: T[]) => [...new Set(values)].sort()

describe('access to the work layer', () => {
    let workspaceId: number
    let elsewhereId: number
    let admin: string
    let full: string
    let assigned: string
    let outsider: string
    const space = { here: randomUUID(), there: randomUUID() }
    const agent = { ceo: randomUUID(), cto: randomUUID(), engineer: randomUUID(), stranger: randomUUID() }
    const project = { open: randomUUID(), closed: randomUUID(), shared: randomUUID(), assigned: randomUUID(), elsewhere: randomUUID() }
    const issue = { open1: randomUUID(), open2: randomUUID(), closed1: randomUUID(), assigned1: randomUUID() }
    const channel = { general: randomUUID(), leadership: randomUUID(), dm: randomUUID() }
    const team = randomUUID()

    const issueNumber = async (title: string) => (await expectOk(selectSingle(service, 'issues', ['number'], { workspace_id: workspaceId, title }))).number
    const asOwner = (title: string) => ({ workspace_id: workspaceId, title })

    beforeAll(async () => {
        admin = await createUser('work-admin')
        full = await createUser('work-full')
        assigned = await createUser('work-assigned')
        outsider = await createUser('work-outsider')
        workspaceId = (await expectOk(insertRow(service, 'workspaces', { name: 'Work test' }, ['id']))).id
        elsewhereId = (await expectOk(insertRow(service, 'workspaces', { name: 'Elsewhere' }, ['id']))).id
        await expectOk(
            insertRows(service, 'users', [
                { id: admin, workspace_id: workspaceId },
                { id: full, workspace_id: workspaceId },
                { id: assigned, workspace_id: workspaceId },
                { id: outsider, workspace_id: elsewhereId },
            ]),
        )
        await expectOk(
            insertRows(service, 'workspace_members', [
                { user_id: admin, workspace_id: workspaceId, role: 'admin', box_scope: 'all' },
                { user_id: full, workspace_id: workspaceId, role: 'member', box_scope: 'all' },
                { user_id: assigned, workspace_id: workspaceId, role: 'member', box_scope: 'assigned' },
                { user_id: outsider, workspace_id: elsewhereId, role: 'admin', box_scope: 'all' },
            ]),
        )
        await expectOk(
            insertRows(service, 'spaces', [
                { id: space.here, workspace_id: workspaceId, name: 'Here', col_start: 0, row_start: 0, col_end: 3, row_end: 3 },
                { id: space.there, workspace_id: elsewhereId, name: 'There', col_start: 0, row_start: 0, col_end: 3, row_end: 3 },
            ]),
        )
        await expectOk(
            insertRows(service, 'agents', [
                { id: agent.ceo, workspace_id: workspaceId, space_id: space.here, name: 'ceo' },
                { id: agent.cto, workspace_id: workspaceId, space_id: space.here, name: 'cto' },
                { id: agent.engineer, workspace_id: workspaceId, space_id: space.here, name: 'engineer' },
                { id: agent.stranger, workspace_id: elsewhereId, space_id: space.there, name: 'stranger' },
            ]),
        )

        await expectOk(
            insertRows(service, 'projects', [
                { id: project.open, workspace_id: workspaceId, key: 'OPEN', name: 'Open', visibility: 'workspace' },
                { id: project.closed, workspace_id: workspaceId, key: 'SHUT', name: 'Closed', visibility: 'restricted' },
                { id: project.shared, workspace_id: workspaceId, key: 'SHRD', name: 'Shared', visibility: 'restricted' },
                { id: project.assigned, workspace_id: workspaceId, key: 'MINE', name: 'Assigned', visibility: 'restricted' },
                { id: project.elsewhere, workspace_id: elsewhereId, key: 'OPEN', name: 'Elsewhere', visibility: 'workspace' },
            ]),
        )
        await expectOk(
            insertRows(service, 'project_members', [
                { project_id: project.shared, user_id: full, workspace_id: workspaceId, access: 'use' },
                { project_id: project.assigned, user_id: assigned, workspace_id: workspaceId, access: 'manage' },
            ]),
        )

        await expectOk(
            insertRows(service, 'issues', [
                { id: issue.open1, workspace_id: workspaceId, project_id: project.open, title: 'open-1' },
                { id: issue.open2, workspace_id: workspaceId, project_id: project.open, title: 'open-2' },
                { id: issue.closed1, workspace_id: workspaceId, project_id: project.closed, title: 'closed-1' },
                { id: issue.assigned1, workspace_id: workspaceId, project_id: project.assigned, title: 'assigned-1' },
            ]),
        )
        await expectOk(
            insertRows(service, 'issue_comments', [
                { workspace_id: workspaceId, issue_id: issue.open1, author_user_id: admin, body: 'on open' },
                { workspace_id: workspaceId, issue_id: issue.closed1, author_user_id: admin, body: 'on closed' },
            ]),
        )
        await expectOk(
            insertRows(service, 'activity_events', [
                { workspace_id: workspaceId, project_id: project.open, entity_type: 'project', entity_id: project.open, action: 'project.created' },
                { workspace_id: workspaceId, project_id: project.closed, entity_type: 'project', entity_id: project.closed, action: 'project.created' },
                { workspace_id: workspaceId, project_id: null, entity_type: 'team', entity_id: randomUUID(), action: 'team.created' },
            ]),
        )

        await expectOk(
            insertRows(service, 'channels', [
                { id: channel.general, workspace_id: workspaceId, name: 'general', kind: 'public' },
                { id: channel.leadership, workspace_id: workspaceId, name: 'leadership', kind: 'private' },
                { id: channel.dm, workspace_id: workspaceId, name: '', kind: 'dm' },
            ]),
        )
        await expectOk(
            insertRows(service, 'channel_members', [
                { channel_id: channel.leadership, workspace_id: workspaceId, user_id: full },
                { channel_id: channel.dm, workspace_id: workspaceId, user_id: assigned },
                { channel_id: channel.leadership, workspace_id: workspaceId, agent_id: agent.ceo },
            ]),
        )
        await expectOk(
            insertRows(service, 'channel_messages', [
                { channel_id: channel.general, workspace_id: workspaceId, author_user_id: admin, body: 'hello all' },
                { channel_id: channel.leadership, workspace_id: workspaceId, author_user_id: full, body: 'just us' },
            ]),
        )

        // A team with a person and a coworker of the Box `Here`, which the `assigned` member has no access to.
        await expectOk(insertRows(service, 'teams', { id: team, workspace_id: workspaceId, name: 'Growth' }))
        await expectOk(
            insertRows(service, 'team_members', [
                { team_id: team, workspace_id: workspaceId, user_id: admin },
                { team_id: team, workspace_id: workspaceId, agent_id: agent.ceo },
            ]),
        )

        // Events outside any project that follow what they are about: a channel, a coworker of the Box
        // `Here`, a team membership of that coworker, and one of a person.
        await expectOk(
            insertRows(service, 'activity_events', [
                { workspace_id: workspaceId, entity_type: 'channel', entity_id: channel.general, action: 'channel.created', metadata: { name: 'general' } },
                { workspace_id: workspaceId, entity_type: 'channel', entity_id: channel.leadership, action: 'channel.created', metadata: { name: 'leadership' } },
                { workspace_id: workspaceId, entity_type: 'agent', entity_id: agent.ceo, action: 'agent.reporting_changed', metadata: {} },
                { workspace_id: workspaceId, entity_type: 'team', entity_id: team, action: 'team.member_added', metadata: { agentId: agent.ceo, userId: null, role: 'member' } },
                { workspace_id: workspaceId, entity_type: 'team', entity_id: team, action: 'team.member_added', metadata: { agentId: null, userId: admin, role: 'lead' } },
            ]),
        )

        await expectOk(insertRows(service, 'assistant_chats', { workspace_id: workspaceId, user_id: admin, title: 'archived shared', shared: true, project_id: null, archived_at: new Date().toISOString() }))
        await expectOk(
            insertRows(service, 'assistant_chats', [
                { workspace_id: workspaceId, user_id: full, title: 'private chat', shared: false, project_id: null },
                { workspace_id: workspaceId, user_id: full, title: 'shared chat', shared: true, project_id: null },
                { workspace_id: workspaceId, user_id: admin, title: 'shared about closed', shared: true, project_id: project.closed },
            ]),
        )
    })

    afterAll(closeDb)

    describe('the issue numbers', () => {
        it('number the issues of a project from 1', async () => {
            const { data } = await selectMany(service, 'issues', ['title', 'number'], { project_id: project.open })
            expect((data ?? []).sort((a, b) => a.title.localeCompare(b.title)).map(row => row.number)).toEqual([1, 2])
        })

        it('are counted per project', async () => {
            expect(await issueNumber('closed-1')).toBe(1)
        })

        it('leave the last number handed out on the project', async () => {
            expect((await expectOk(selectSingle(service, 'projects', ['issue_counter'], { id: project.open }))).issue_counter).toBe(2)
        })

        it('replace a number written by the caller with the next one', async () => {
            await expectOk(insertRows(service, 'issues', { workspace_id: workspaceId, project_id: project.open, title: 'open-3', number: 42 }))
            expect(await issueNumber('open-3')).toBe(3)
        })

        it('never hand out again a number freed by a deleted issue', async () => {
            await expectOk(deleteRows(service, 'issues', asOwner('open-3')))
            await expectOk(insertRows(service, 'issues', { workspace_id: workspaceId, project_id: project.open, title: 'open-4' }))
            expect(await issueNumber('open-4')).toBe(4)
        })

        it('stay with their issue', async () => {
            const { error } = await updateRows(service, 'issues', { number: 9 }, asOwner('open-1'))
            expect(error?.code).toBe('23514')
        })
    })

    describe('an issue', () => {
        it('keeps its project', async () => {
            const { error } = await updateRows(service, 'issues', { project_id: project.closed }, asOwner('open-1'))
            expect(error?.code).toBe('23514')
        })

        it('cannot point at a project of another workspace', async () => {
            const { error } = await insertRows(service, 'issues', { workspace_id: workspaceId, project_id: project.elsewhere, title: 'cross' })
            expect(error?.code).toBe('23503')
        })

        it('cannot be assigned to a coworker of another workspace', async () => {
            const { error } = await updateRows(service, 'issues', { assignee_agent_id: agent.stranger }, asOwner('open-1'))
            expect(error?.code).toBe('23503')
        })

        it('has one assignee at most', async () => {
            const { error } = await updateRows(service, 'issues', { assignee_user_id: admin, assignee_agent_id: agent.ceo }, asOwner('open-1'))
            expect(error?.code).toBe('23514')
        })
    })

    it('keeps the activity log append-only', async () => {
        const { error } = await updateRows(service, 'activity_events', { action: 'project.updated' }, { workspace_id: workspaceId })
        expect(error?.code).toBe('23514')
    })

    describe('the reporting line', () => {
        it('points a coworker at a manager of its workspace', async () => {
            await expectOk(updateRows(service, 'agents', { reports_to_agent_id: agent.ceo }, { id: agent.cto }))
            await expectOk(updateRows(service, 'agents', { reports_to_agent_id: agent.cto }, { id: agent.engineer }))
            expect((await expectOk(selectSingle(service, 'agents', ['reports_to_agent_id'], { id: agent.engineer }))).reports_to_agent_id).toBe(agent.cto)
        })

        it('never points a coworker at itself', async () => {
            const { error } = await updateRows(service, 'agents', { reports_to_agent_id: agent.ceo }, { id: agent.ceo })
            expect(error?.code).toBe('23514')
            expect(error?.message).toBe('agents_reports_to_self: an agent cannot report to itself')
        })

        it('never loops', async () => {
            const { error } = await updateRows(service, 'agents', { reports_to_agent_id: agent.engineer }, { id: agent.ceo })
            expect(error?.code).toBe('23514')
            expect(error?.message).toBe('agents_reports_to_cycle: this reporting line would loop back to the agent')
        })

        it('takes its manager from the same workspace', async () => {
            const { error } = await updateRows(service, 'agents', { reports_to_agent_id: agent.stranger }, { id: agent.ceo })
            expect(error?.code).toBe('23514')
            expect(error?.message).toBe('agents_reports_to_other_workspace: the manager belongs to another workspace')
        })

        it('leaves the reports of a deleted manager without one', async () => {
            await expectOk(deleteRows(service, 'agents', { id: agent.cto }))
            expect((await expectOk(selectSingle(service, 'agents', ['reports_to_agent_id'], { id: agent.engineer }))).reports_to_agent_id).toBeNull()
        })

        it('is checked along the whole line, whatever the caller may read', async () => {
            const { data } = await queryRows<{ prosecdef: boolean }>(service, sql`select prosecdef from pg_proc where oid = 'public.agents_check_reporting_line'::regproc`)
            expect(data).toEqual([{ prosecdef: true }])
        })
    })

    describe('an admin', () => {
        it('sees every project', async () => {
            const { data } = await selectMany(userScope(admin), 'projects', ['key'], { workspace_id: workspaceId })
            expect(sortedUnique((data ?? []).map(row => row.key))).toEqual(['MINE', 'OPEN', 'SHRD', 'SHUT'])
        })

        it('manages every project', async () => {
            const { data } = await callColumn<string>(userScope(admin), 'manageable_project_ids')
            const ofWorkspace: string[] = [project.open, project.closed, project.shared, project.assigned]
            expect((data ?? []).filter(id => ofWorkspace.includes(id))).toHaveLength(4)
        })

        it('reads every comment', async () => {
            expect((await selectMany(userScope(admin), 'issue_comments', ['id'], { workspace_id: workspaceId })).data).toHaveLength(2)
        })

        it('sees the public channels, not a private one nor a direct message', async () => {
            const { data } = await selectMany(userScope(admin), 'channels', ['name'], { workspace_id: workspaceId })
            expect(sortedUnique((data ?? []).map(row => row.name))).toEqual(['general'])
        })

        it('writes no issue from the browser', async () => {
            const { error } = await insertRows(userScope(admin), 'issues', { workspace_id: workspaceId, project_id: project.open, title: 'from the browser' })
            expect(error?.code).toBe('42501')
        })

        it('reads the activity of the channels they read, not of a private one', async () => {
            const { data } = await selectMany(userScope(admin), 'activity_events', ['entity_id'], { workspace_id: workspaceId, entity_type: 'channel' })
            expect(sortedUnique((data ?? []).map(row => row.entity_id))).toEqual([channel.general])
        })

        it('still reads the shared chat they archived', async () => {
            expect((await selectMany(userScope(admin), 'assistant_chats', ['id'], { workspace_id: workspaceId, title: 'archived shared' })).data).toHaveLength(1)
        })

        it('leaves the reporting line, the title and the budget of a coworker to the server', async () => {
            const scope = userScope(admin)
            expect((await updateRows(scope, 'agents', { reports_to_agent_id: null }, { id: agent.engineer })).error?.code).toBe('42501')
            expect((await updateRows(scope, 'agents', { title: 'Chief' }, { id: agent.ceo })).error?.code).toBe('42501')
            expect((await updateRows(scope, 'agents', { monthly_budget_micros: 1 }, { id: agent.ceo })).error?.code).toBe('42501')
        })

        it('still moves a coworker on the board from the browser', async () => {
            await expectOk(updateRows(userScope(admin), 'agents', { col: 2 }, { id: agent.ceo }))
        })
    })

    describe('a member scoped to all', () => {
        it('sees the open projects and the one named to them', async () => {
            const { data } = await selectMany(userScope(full), 'projects', ['key'], { workspace_id: workspaceId })
            expect(sortedUnique((data ?? []).map(row => row.key))).toEqual(['OPEN', 'SHRD'])
        })

        it('sees the issues of those projects', async () => {
            const { data } = await selectMany(userScope(full), 'issues', ['title'], { workspace_id: workspaceId })
            expect(sortedUnique((data ?? []).map(row => row.title))).toEqual(['open-1', 'open-2', 'open-4'])
        })

        it('reads the comments of visible issues only', async () => {
            const { data } = await selectMany(userScope(full), 'issue_comments', ['body'], { workspace_id: workspaceId })
            expect(sortedUnique((data ?? []).map(row => row.body))).toEqual(['on open'])
        })

        it('reads the activity of visible projects and outside any project', async () => {
            const { data } = await selectMany(userScope(full), 'activity_events', ['action', 'project_id'], { workspace_id: workspaceId })
            expect(sortedUnique((data ?? []).map(row => row.action))).toEqual(['agent.reporting_changed', 'channel.created', 'project.created', 'team.created', 'team.member_added'])
            expect((data ?? []).filter(row => row.project_id === project.closed)).toEqual([])
        })

        it('reads the activity of the public channel and of the private one they joined', async () => {
            const { data } = await selectMany(userScope(full), 'activity_events', ['entity_id'], { workspace_id: workspaceId, entity_type: 'channel' })
            expect(sortedUnique((data ?? []).map(row => row.entity_id))).toEqual([channel.general, channel.leadership].sort())
        })

        it('manages no project with `use`', async () => {
            expect((await callColumn<string>(userScope(full), 'manageable_project_ids')).data).toEqual([])
        })

        it('sees the public channels and the private one they joined', async () => {
            const { data } = await selectMany(userScope(full), 'channels', ['name'], { workspace_id: workspaceId })
            expect(sortedUnique((data ?? []).map(row => row.name))).toEqual(['general', 'leadership'])
        })

        it('reads the messages of the channels they see', async () => {
            const { data } = await selectMany(userScope(full), 'channel_messages', ['body'], { workspace_id: workspaceId })
            expect(sortedUnique((data ?? []).map(row => row.body))).toEqual(['hello all', 'just us'])
        })

        it('reads who else is in their private channel, coworkers included', async () => {
            expect((await selectMany(userScope(full), 'channel_members', ['id'], { channel_id: channel.leadership })).data).toHaveLength(2)
        })

        it('reads their chats, not one shared about a project they cannot see', async () => {
            const { data } = await selectMany(userScope(full), 'assistant_chats', ['title'], { workspace_id: workspaceId })
            expect(sortedUnique((data ?? []).map(row => row.title))).toEqual(['private chat', 'shared chat'])
        })

        it('reads the people and the coworkers of a team', async () => {
            expect((await selectMany(userScope(full), 'team_members', ['id'], { team_id: team })).data).toHaveLength(2)
        })

        it('writes no issue from the browser', async () => {
            const { error } = await updateRows(userScope(full), 'issues', { title: 'renamed' }, asOwner('open-1'))
            expect(error?.code).toBe('42501')
        })
    })

    describe('a member scoped to assigned', () => {
        it('sees only the project named to them', async () => {
            const { data } = await selectMany(userScope(assigned), 'projects', ['key'], { workspace_id: workspaceId })
            expect((data ?? []).map(row => row.key)).toEqual(['MINE'])
        })

        it('manages the project named to them with `manage`', async () => {
            expect((await callColumn<string>(userScope(assigned), 'manageable_project_ids')).data).toEqual([project.assigned])
        })

        it('sees only its issues', async () => {
            const { data } = await selectMany(userScope(assigned), 'issues', ['title'], { workspace_id: workspaceId })
            expect((data ?? []).map(row => row.title)).toEqual(['assigned-1'])
        })

        it('sees no public channel until they join it, and their direct message', async () => {
            const { data } = await selectMany(userScope(assigned), 'channels', ['kind'], { workspace_id: workspaceId })
            expect((data ?? []).map(row => row.kind)).toEqual(['dm'])
        })

        it('reads a shared chat of the workspace, never a private one of someone else', async () => {
            const { data } = await selectMany(userScope(assigned), 'assistant_chats', ['title'], { workspace_id: workspaceId })
            expect((data ?? []).map(row => row.title)).toEqual(['shared chat'])
        })

        it('reads the people of a team', async () => {
            expect((await selectMany(userScope(assigned), 'team_members', ['id'], { team_id: team, user_id: { notNull: true } })).data).toHaveLength(1)
        })

        it('does not learn which coworkers of a Box it cannot see are in a team', async () => {
            expect((await selectMany(userScope(assigned), 'team_members', ['id'], { team_id: team, agent_id: { notNull: true } })).data).toHaveLength(0)
        })

        it('reads no event of a channel nor of a coworker it cannot see', async () => {
            expect((await selectMany(userScope(assigned), 'activity_events', ['id'], { workspace_id: workspaceId, entity_type: ['channel', 'agent'] })).data).toHaveLength(0)
        })

        it('reads a team membership of a person, not of a coworker it cannot see', async () => {
            expect((await selectMany(userScope(assigned), 'activity_events', ['id'], { workspace_id: workspaceId, action: 'team.member_added' })).data).toHaveLength(1)
        })
    })

    describe('someone of another workspace', () => {
        it('sees no project of the workspace', async () => {
            expect((await selectMany(userScope(outsider), 'projects', ['id'], { workspace_id: workspaceId })).data).toHaveLength(0)
        })

        it('sees no channel nor activity of the workspace', async () => {
            const scope = userScope(outsider)
            expect((await selectMany(scope, 'channels', ['id'], { workspace_id: workspaceId })).data).toHaveLength(0)
            expect((await selectMany(scope, 'activity_events', ['id'], { workspace_id: workspaceId })).data).toHaveLength(0)
        })
    })

    describe('a visitor without a session', () => {
        const tables = ['projects', 'project_members', 'issues', 'issue_comments', 'activity_events', 'channels', 'channel_members', 'channel_messages', 'assistant_chats', 'teams', 'team_members'] as const

        it.each(tables)('reads nothing of %s', async table => {
            const { data, error } = await selectMany(anonScope(), table, ['workspace_id'], { workspace_id: workspaceId })
            expect(data).toBeNull()
            expect(error?.code).toBe('42501')
        })
    })
})
