import { ACTIVITY_ACTIONS, type ActivityEvent } from '@lumvika/contracts'
import { describe, expect, it } from 'vitest'

import { activitySentence, SENTENCE_KEYS } from './activity-sentence'

const REFS = {
    issues: { 'issue-1': { ref: 'WEB-3', title: 'Pick the hosting provider' } },
    projects: { 'project-1': { key: 'WEB', name: 'Website relaunch' } },
    goals: {},
    teams: { 'team-1': { name: 'Growth' } },
    channels: {},
}

function event(overrides: Partial<ActivityEvent>): ActivityEvent {
    return { id: 'e', projectId: 'project-1', issueId: 'issue-1', entityType: 'issue', entityId: 'issue-1', action: 'issue.created', actor: { kind: 'user', userId: 'me' }, metadata: {}, createdAt: '2026-11-12T10:00:00.000Z', ...overrides }
}

describe('activitySentence', () => {
    it('has a sentence for every action of the contracts', () => {
        for (const action of ACTIVITY_ACTIONS) expect((SENTENCE_KEYS as Record<string, string>)[action]).toBeTruthy()
    })

    it('names the issue and the move of a status change', () => {
        const sentence = activitySentence(event({ action: 'issue.status_changed', metadata: { ref: 'WEB-3', from: 'in_progress', to: 'in_review' } }), REFS)
        expect(sentence).toEqual({ key: 'issueStatusChanged', target: { kind: 'issue', ref: 'WEB-3', title: 'Pick the hosting provider' }, status: { of: 'issue', from: 'in_progress', to: 'in_review' } })
    })

    it('falls back on a plain update when the move is not in the metadata', () => {
        expect(activitySentence(event({ action: 'issue.status_changed', metadata: { to: 'nowhere' } }), REFS).key).toBe('issueUpdated')
        expect(activitySentence(event({ action: 'goal.status_changed', entityType: 'goal', entityId: 'g', metadata: {} }), REFS)).toMatchObject({ key: 'goalUpdated', target: { kind: 'goal', title: null } })
    })

    it('names the assignee and the member a change is about', () => {
        expect(activitySentence(event({ action: 'issue.assigned', metadata: { assignee: { kind: 'agent', agentId: 'scout' } } }), REFS).member).toEqual({ kind: 'agent', agentId: 'scout' })
        expect(activitySentence(event({ action: 'team.member_added', entityType: 'team', entityId: 'team-1', projectId: null, metadata: { userId: null, agentId: 'quill' } }), REFS)).toMatchObject({ key: 'teamMemberAdded', target: { kind: 'team', name: 'Growth' }, member: { kind: 'agent', agentId: 'quill' } })
    })

    it('reads what the event kept when the page could not name the issue', () => {
        const sentence = activitySentence(event({ issueId: 'gone', metadata: { ref: 'WEB-9', title: 'Old title' } }), REFS)
        expect(sentence.target).toEqual({ kind: 'issue', ref: 'WEB-9', title: 'Old title' })
    })

    it('names a deleted goal or team from what the event kept', () => {
        expect(activitySentence(event({ action: 'goal.deleted', entityType: 'goal', entityId: 'gone', projectId: null, issueId: null, metadata: { title: 'Old goal' } }), REFS)).toEqual({ key: 'goalDeleted', target: { kind: 'goal', title: 'Old goal' } })
        expect(activitySentence(event({ action: 'team.deleted', entityType: 'team', entityId: 'gone', projectId: null, issueId: null, metadata: { name: 'Ops' } }), REFS)).toEqual({ key: 'teamDeleted', target: { kind: 'team', name: 'Ops' } })
        expect(activitySentence(event({ action: 'team.member_role_changed', entityType: 'team', entityId: 'team-1', projectId: null, issueId: null, metadata: { userId: 'ada', agentId: null, from: 'member', to: 'lead' } }), REFS)).toMatchObject({ key: 'teamMemberRoleChanged', member: { kind: 'user', userId: 'ada' } })
    })

    it('falls back on a generic sentence for an action it does not know', () => {
        const unknown = event({ action: 'issue.archived' as ActivityEvent['action'] })
        expect(activitySentence(unknown, REFS)).toEqual({ key: 'genericWithTarget', target: { kind: 'issue', ref: 'WEB-3', title: 'Pick the hosting provider' } })
        const nothingKnown = event({ action: 'billing.renewed' as ActivityEvent['action'], entityType: 'invoice' as ActivityEvent['entityType'] })
        expect(activitySentence(nothingKnown, REFS)).toEqual({ key: 'generic', target: null })
    })
})
