import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthorizationError } from '@/app/api/_auth/errors'
import { AppError } from '@/lib/i18n/action-error'

const mocks = vi.hoisted(() => ({
    requireLightSessionActor: vi.fn(),
    assertAgentAccess: vi.fn(),
    assertProjectAccess: vi.fn(),
    assertIssueAccess: vi.fn(),
    visibleProjectIds: vi.fn(),
    listIssues: vi.fn(),
    getIssueByRef: vi.fn(),
    createIssue: vi.fn(),
    createSubIssue: vi.fn(),
    updateIssue: vi.fn(),
    transitionIssue: vi.fn(),
    moveIssue: vi.fn(),
    assignIssue: vi.fn(),
    listIssueComments: vi.fn(),
    addIssueComment: vi.fn(),
    editIssueComment: vi.fn(),
    listActivity: vi.fn(),
    selectMaybeSingle: vi.fn(),
}))

vi.mock('@/app/api/_auth/access', async importOriginal => ({ ...(await importOriginal<typeof import('@/app/api/_auth/access')>()), requireLightSessionActor: mocks.requireLightSessionActor, assertAgentAccess: mocks.assertAgentAccess }))
vi.mock('@/app/api/_auth/project-access', () => ({
    assertProjectAccess: mocks.assertProjectAccess,
    assertIssueAccess: mocks.assertIssueAccess,
    visibleProjectIds: mocks.visibleProjectIds,
    ISSUE_NOT_FOUND: 'issueNotFound',
}))
vi.mock('@/app/api/_services/work/issues.service', () => ({
    listIssues: mocks.listIssues,
    getIssueByRef: mocks.getIssueByRef,
    createIssue: mocks.createIssue,
    createSubIssue: mocks.createSubIssue,
    updateIssue: mocks.updateIssue,
    transitionIssue: mocks.transitionIssue,
    moveIssue: mocks.moveIssue,
    assignIssue: mocks.assignIssue,
}))
vi.mock('@/app/api/_services/work/issue-comments.service', () => ({ listIssueComments: mocks.listIssueComments, addIssueComment: mocks.addIssueComment, editIssueComment: mocks.editIssueComment }))
vi.mock('@/app/api/_services/work/activity.service', () => ({ listActivity: mocks.listActivity }))
vi.mock('@/supabase/serviceRole', () => ({ createServiceRoleClient: () => ({}) }))
vi.mock('@/supabase/supabase-helpers', () => ({ selectMaybeSingle: mocks.selectMaybeSingle }))

const actions = await import('./issues.actions')

const WORKSPACE_ID = 7
const ME = 'user-me'
const ACTOR = { kind: 'user', userId: ME, workspaceId: WORKSPACE_ID, role: 'member', boxScope: 'all' } as const
const SCOPE = { workspaceId: WORKSPACE_ID }
const AUTHOR = { kind: 'user', userId: ME }
const PROJECT = { id: 'p1', workspace_id: WORKSPACE_ID, key: 'ENG', visibility: 'workspace', archived_at: null }

function record(overrides: Record<string, unknown> = {}) {
    return {
        id: 'i1',
        workspace_id: WORKSPACE_ID,
        project_id: 'p1',
        number: 12,
        title: 'Ship the board',
        description: null,
        status: 'todo',
        priority: 'high',
        assignee_user_id: null,
        assignee_agent_id: 'agent-1',
        created_by_user_id: ME,
        created_by_agent_id: null,
        parent_issue_id: null,
        goal_id: null,
        due_date: null,
        position: 2048,
        blocked_reason: null,
        checkout_run_id: null,
        checked_out_at: null,
        session_id: null,
        started_at: null,
        completed_at: null,
        created_at: '2026-11-10T10:00:00Z',
        updated_at: '2026-11-10T11:00:00Z',
        projectKey: 'ENG',
        ref: 'ENG-12',
        ...overrides,
    }
}

beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireLightSessionActor.mockResolvedValue(ACTOR)
    mocks.assertProjectAccess.mockResolvedValue({ actor: ACTOR, access: 'use', project: PROJECT })
    mocks.assertIssueAccess.mockResolvedValue({ actor: ACTOR, access: 'use', project: PROJECT, issue: { id: 'i1', workspace_id: WORKSPACE_ID, project_id: 'p1', number: 12 } })
})

describe('listProjectIssuesAction', () => {
    it('lists the issues of a project the caller uses, in board order', async () => {
        mocks.listIssues.mockResolvedValue([{ id: 'i1' }])

        await expect(actions.listProjectIssuesAction('p1')).resolves.toEqual({ ok: true, issues: [{ id: 'i1' }] })
        expect(mocks.assertProjectAccess).toHaveBeenCalledWith('p1', 'use')
        expect(mocks.listIssues).toHaveBeenCalledWith(SCOPE, { projectId: 'p1', sort: 'position', limit: 500 }, new Set(['p1']))
    })

    it('lists nothing for a project the caller cannot see', async () => {
        mocks.assertProjectAccess.mockRejectedValue(new AuthorizationError('projectNotFound'))

        await expect(actions.listProjectIssuesAction('p1')).resolves.toMatchObject({ ok: false, code: 'projectNotFound' })
        expect(mocks.listIssues).not.toHaveBeenCalled()
    })
})

describe('getIssueAction', () => {
    it('reads the issue among the projects the caller sees', async () => {
        const visible = new Set(['p1'])
        mocks.visibleProjectIds.mockResolvedValue(visible)
        mocks.getIssueByRef.mockResolvedValue({ id: 'i1', ref: 'ENG-12' })

        await expect(actions.getIssueAction('eng-12')).resolves.toEqual({ ok: true, issue: { id: 'i1', ref: 'ENG-12' } })
        expect(mocks.getIssueByRef).toHaveBeenCalledWith(SCOPE, 'eng-12', visible)
    })

    it('answers not found when nothing matches', async () => {
        mocks.visibleProjectIds.mockResolvedValue('all')
        mocks.getIssueByRef.mockResolvedValue(null)

        await expect(actions.getIssueAction('ENG-99')).resolves.toMatchObject({ ok: false, code: 'issueNotFound' })
    })
})

describe('createIssueAction', () => {
    it('creates the issue as the caller and hands back its summary', async () => {
        mocks.createIssue.mockResolvedValue(record())
        const input = { projectId: 'p1', title: 'Ship the board', status: 'todo' as const }

        const result = await actions.createIssueAction(input)

        expect(mocks.assertProjectAccess).toHaveBeenCalledWith('p1', 'use')
        expect(mocks.createIssue).toHaveBeenCalledWith(SCOPE, AUTHOR, input)
        expect(result).toMatchObject({ ok: true, issue: { id: 'i1', ref: 'ENG-12', status: 'todo', assignee: { kind: 'agent', agentId: 'agent-1' }, position: 2048 } })
    })

    it('sends an archived project back as its code', async () => {
        mocks.createIssue.mockRejectedValue(new AppError('projectArchived'))

        await expect(actions.createIssueAction({ projectId: 'p1', title: 'Late' })).resolves.toMatchObject({ ok: false, code: 'projectArchived' })
    })
})

describe('handing work to a coworker', () => {
    const HIDDEN = { kind: 'agent', agentId: 'agent-hidden' } as const

    it('needs use of the coworker to create, sub-create or assign an issue for it', async () => {
        mocks.createIssue.mockResolvedValue(record())
        mocks.createSubIssue.mockResolvedValue(record())
        mocks.assignIssue.mockResolvedValue(record())
        const coworker = { kind: 'agent', agentId: 'agent-1' } as const

        await expect(actions.createIssueAction({ projectId: 'p1', title: 'Ship', assignee: coworker })).resolves.toMatchObject({ ok: true })
        await expect(actions.createSubIssueAction('i1', { title: 'Child', assignee: coworker })).resolves.toMatchObject({ ok: true })
        await expect(actions.assignIssueAction('i1', coworker)).resolves.toMatchObject({ ok: true })
        expect(mocks.assertAgentAccess.mock.calls).toEqual([
            ['agent-1', 'use', ACTOR],
            ['agent-1', 'use', ACTOR],
            ['agent-1', 'use', ACTOR],
        ])
    })

    it('answers a coworker in a Box the caller cannot use like one that does not exist, and writes nothing', async () => {
        mocks.assertAgentAccess.mockRejectedValue(new AuthorizationError('coworkerNotFound'))

        await expect(actions.createIssueAction({ projectId: 'p1', title: 'Ship', assignee: HIDDEN })).resolves.toMatchObject({ ok: false, code: 'coworkerNotFound' })
        await expect(actions.createSubIssueAction('i1', { title: 'Child', assignee: HIDDEN })).resolves.toMatchObject({ ok: false, code: 'coworkerNotFound' })
        await expect(actions.assignIssueAction('i1', HIDDEN)).resolves.toMatchObject({ ok: false, code: 'coworkerNotFound' })
        expect(mocks.createIssue).not.toHaveBeenCalled()
        expect(mocks.createSubIssue).not.toHaveBeenCalled()
        expect(mocks.assignIssue).not.toHaveBeenCalled()
    })

    it('asks nothing of a Box to assign a person or nobody', async () => {
        mocks.assignIssue.mockResolvedValue(record({ assignee_agent_id: null }))

        await expect(actions.assignIssueAction('i1', { kind: 'user', userId: 'user-2' })).resolves.toMatchObject({ ok: true })
        await expect(actions.assignIssueAction('i1', null)).resolves.toMatchObject({ ok: true })
        expect(mocks.assertAgentAccess).not.toHaveBeenCalled()
    })
})

describe('the issue verbs', () => {
    it('assert use on the issue, then act as the caller', async () => {
        mocks.createSubIssue.mockResolvedValue(record({ id: 'i2', number: 13, parent_issue_id: 'i1' }))
        mocks.updateIssue.mockResolvedValue(record({ title: 'Renamed' }))
        mocks.transitionIssue.mockResolvedValue(record({ status: 'blocked', blocked_reason: 'Waiting on legal' }))
        mocks.moveIssue.mockResolvedValue(record({ status: 'in_progress', position: 512 }))
        mocks.assignIssue.mockResolvedValue(record({ assignee_agent_id: null, assignee_user_id: 'user-2' }))

        await expect(actions.createSubIssueAction('i1', { title: 'Child' })).resolves.toMatchObject({ ok: true, issue: { parentIssueId: 'i1', ref: 'ENG-13' } })
        await expect(actions.updateIssueAction('i1', { title: 'Renamed' })).resolves.toMatchObject({ ok: true, issue: { title: 'Renamed' } })
        await expect(actions.transitionIssueAction('i1', 'blocked', 'Waiting on legal')).resolves.toMatchObject({ ok: true, issue: { status: 'blocked' } })
        await expect(actions.moveIssueAction('i1', { status: 'in_progress', position: 512 })).resolves.toMatchObject({ ok: true, issue: { status: 'in_progress', position: 512 } })
        await expect(actions.assignIssueAction('i1', { kind: 'user', userId: 'user-2' })).resolves.toMatchObject({ ok: true, issue: { assignee: { kind: 'user', userId: 'user-2' } } })

        for (const call of mocks.assertIssueAccess.mock.calls) expect(call).toEqual(['i1', 'use'])
        expect(mocks.transitionIssue).toHaveBeenCalledWith(SCOPE, AUTHOR, 'i1', 'blocked', { blockedReason: 'Waiting on legal' })
        expect(mocks.moveIssue).toHaveBeenCalledWith(SCOPE, AUTHOR, 'i1', { status: 'in_progress', position: 512 })
        expect(mocks.assignIssue).toHaveBeenCalledWith(SCOPE, AUTHOR, 'i1', { kind: 'user', userId: 'user-2' })
    })

    it('send a refused transition back as its code', async () => {
        mocks.moveIssue.mockRejectedValue(new AppError('issueTransitionNotAllowed'))

        await expect(actions.moveIssueAction('i1', { status: 'done', position: 1 })).resolves.toMatchObject({ ok: false, code: 'issueTransitionNotAllowed' })
    })
})

describe('comments', () => {
    it('adds a comment as the caller', async () => {
        mocks.addIssueComment.mockResolvedValue({ id: 'c1', body: 'On it' })

        await expect(actions.addIssueCommentAction('i1', 'On it')).resolves.toEqual({ ok: true, comment: { id: 'c1', body: 'On it' } })
        expect(mocks.addIssueComment).toHaveBeenCalledWith(SCOPE, AUTHOR, 'i1', { body: 'On it' })
    })

    it('edits a comment once access to its issue is asserted', async () => {
        mocks.selectMaybeSingle.mockResolvedValue({ data: { issue_id: 'i1' } })
        mocks.editIssueComment.mockResolvedValue({ id: 'c1', body: 'Fixed' })

        await expect(actions.editIssueCommentAction('c1', 'Fixed')).resolves.toEqual({ ok: true, comment: { id: 'c1', body: 'Fixed' } })
        expect(mocks.selectMaybeSingle).toHaveBeenCalledWith(expect.anything(), 'issue_comments', ['issue_id'], { id: 'c1', workspace_id: WORKSPACE_ID })
        expect(mocks.assertIssueAccess).toHaveBeenCalledWith('i1', 'use', ACTOR)
        expect(mocks.editIssueComment).toHaveBeenCalledWith(SCOPE, AUTHOR, 'c1', { body: 'Fixed' })
    })

    it('answers not found for a comment outside the workspace', async () => {
        mocks.selectMaybeSingle.mockResolvedValue({ data: null })

        await expect(actions.editIssueCommentAction('c9', 'Hi')).resolves.toMatchObject({ ok: false, code: 'commentNotFound' })
        expect(mocks.editIssueComment).not.toHaveBeenCalled()
    })
})

describe('listIssueActivityAction', () => {
    it('reads the log of the issue within its project', async () => {
        mocks.listActivity.mockResolvedValue({ events: [{ id: 'e1' }], nextCursor: null })

        await expect(actions.listIssueActivityAction('i1')).resolves.toEqual({ ok: true, events: [{ id: 'e1' }] })
        expect(mocks.listActivity).toHaveBeenCalledWith(SCOPE, { issueId: 'i1', limit: 100 }, new Set(['p1']))
    })
})
