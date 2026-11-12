import { describe, expect, it, vi } from 'vitest'

import { workDatabase, type Row } from '@/test/work-fake'
import { issueRow, projectRow, WORKSPACE } from '@/test/work-rows'

vi.mock('@/supabase/serviceRole', () => ({ createServiceRoleClient: vi.fn() }))

const { eventVisible, listActivityFeed } = await import('./activity-feed.service')

function event(id: string, overrides: Row): Row {
    return { id, workspace_id: WORKSPACE, project_id: null, issue_id: null, actor_user_id: 'me', actor_agent_id: null, metadata: {}, created_at: `2026-11-1${id.length}T00:00:00.000Z`, ...overrides }
}

function setup() {
    const db = workDatabase({
        projects: [projectRow()],
        issues: [issueRow({ id: 'issue-1', number: 7, title: 'Pick the hosting' })],
        goals: [{ id: 'goal-1', workspace_id: WORKSPACE, title: 'Grow the audience' }],
        teams: [{ id: 'team-1', workspace_id: WORKSPACE, name: 'Growth' }],
        channels: [
            { id: 'open', workspace_id: WORKSPACE, name: 'general' },
            { id: 'dm', workspace_id: WORKSPACE, name: 'dm-ada-me' },
        ],
        activity_events: [
            event('a', { project_id: 'project-1', issue_id: 'issue-1', entity_type: 'issue', entity_id: 'issue-1', action: 'issue.status_changed' }),
            event('bb', { entity_type: 'goal', entity_id: 'goal-1', action: 'goal.created' }),
            event('ccc', { entity_type: 'team', entity_id: 'team-1', action: 'team.created' }),
            event('dddd', { entity_type: 'channel', entity_id: 'open', action: 'channel.created' }),
            event('eeeee', { entity_type: 'channel', entity_id: 'dm', action: 'channel.created' }),
        ],
    })
    return { workspaceId: WORKSPACE, supabase: db.client }
}

describe('listActivityFeed', () => {
    it('names what each event links to, in one read per kind', async () => {
        const page = await listActivityFeed(setup(), {}, 'all', new Set(['open']), 'all')

        expect(page.events.map(item => item.id)).toEqual(['dddd', 'ccc', 'bb', 'a'])
        expect(page.refs).toEqual({
            issues: { 'issue-1': { ref: 'ENG-7', title: 'Pick the hosting' } },
            projects: { 'project-1': { key: 'ENG', name: 'Engineering' } },
            goals: { 'goal-1': { title: 'Grow the audience' } },
            teams: { 'team-1': { name: 'Growth' } },
            channels: { open: { name: 'general' } },
        })
    })

    it('reads nothing more for an empty page', async () => {
        const page = await listActivityFeed(setup(), { projectId: 'nowhere' }, new Set(['project-1']), 'all', 'all')
        expect(page).toEqual({ events: [], nextCursor: null, refs: { issues: {}, projects: {}, goals: {}, teams: {}, channels: {} } })
    })
})

describe('eventVisible', () => {
    const shown = (entityType: string, entityId: string, metadata: Record<string, unknown> = {}) => eventVisible({ entityType, entityId, metadata } as never, new Set(['open']), new Set(['ada']))

    it('keeps out a channel the caller cannot read', () => {
        expect(shown('channel', 'open')).toBe(true)
        expect(shown('channel', 'dm')).toBe(false)
    })

    it('keeps out a coworker, or a team membership of one, in a Box closed to the caller', () => {
        expect(shown('agent', 'ada')).toBe(true)
        expect(shown('agent', 'hidden')).toBe(false)
        expect(shown('team', 'team-1', { agentId: 'ada', userId: null })).toBe(true)
        expect(shown('team', 'team-1', { agentId: 'hidden', userId: null })).toBe(false)
        expect(shown('team', 'team-1', { agentId: null, userId: 'anna' })).toBe(true)
        expect(shown('team', 'team-1', { name: 'Growth' })).toBe(true)
    })

    it('sees everything with nothing to filter', () => {
        expect(eventVisible({ entityType: 'agent', entityId: 'hidden', metadata: {} } as never, 'all', 'all')).toBe(true)
    })
})
