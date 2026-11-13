import { goalStatusSchema, issueStatusSchema, type ActivityAction, type ActivityEvent, type WorkMemberRef } from '@lumvika/contracts'

import type { ActivityRefs } from '@/app/api/_services/work/activity-feed.service'

// What an event links to, with what the page knows of its name. A name it does not know (an issue
// deleted since, a new kind of entity) reads as a generic word rather than an id.
export type ActivityTarget =
    | { kind: 'issue'; ref: string | null; title: string | null }
    | { kind: 'project'; key: string | null; name: string | null }
    | { kind: 'goal'; title: string | null }
    | { kind: 'team'; name: string | null }
    | { kind: 'channel'; id: string; name: string | null }
    | { kind: 'coworker'; agentId: string }

export const SENTENCE_KEYS = {
    'project.created': 'projectCreated',
    'project.updated': 'projectUpdated',
    'project.archived': 'projectArchived',
    'project.restored': 'projectRestored',
    'project.member_granted': 'projectMemberGranted',
    'project.member_revoked': 'projectMemberRevoked',
    'issue.created': 'issueCreated',
    'issue.updated': 'issueUpdated',
    'issue.status_changed': 'issueStatusChanged',
    'issue.assigned': 'issueAssigned',
    'issue.unassigned': 'issueUnassigned',
    'issue.commented': 'issueCommented',
    'issue.comment_edited': 'issueCommentEdited',
    'issue.checked_out': 'issueCheckedOut',
    'issue.released': 'issueReleased',
    'issue.run_failed': 'issueRunFailed',
    'goal.created': 'goalCreated',
    'goal.updated': 'goalUpdated',
    'goal.status_changed': 'goalStatusChanged',
    'goal.deleted': 'goalDeleted',
    'team.created': 'teamCreated',
    'team.updated': 'teamUpdated',
    'team.deleted': 'teamDeleted',
    'team.member_added': 'teamMemberAdded',
    'team.member_removed': 'teamMemberRemoved',
    'team.member_role_changed': 'teamMemberRoleChanged',
    'channel.created': 'channelCreated',
    'channel.updated': 'channelUpdated',
    'channel.archived': 'channelArchived',
    'agent.reporting_changed': 'coworkerReportingChanged',
} as const satisfies Record<ActivityAction, string>

export type SentenceKey = (typeof SENTENCE_KEYS)[keyof typeof SENTENCE_KEYS] | 'generic' | 'genericWithTarget'

function sentenceKeyOf(action: string): SentenceKey | null {
    return Object.prototype.hasOwnProperty.call(SENTENCE_KEYS, action) ? SENTENCE_KEYS[action as keyof typeof SENTENCE_KEYS] : null
}

export type ActivitySentence = {
    key: SentenceKey
    target: ActivityTarget | null
    // A status move: the words come from the issue or the goal statuses.
    status?: { of: 'issue' | 'goal'; from: string; to: string }
    // The other person or coworker the sentence names: the new assignee, a member added.
    member?: WorkMemberRef | null
}

function text(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value : null
}

function memberOf(metadata: Record<string, unknown>, field?: string): WorkMemberRef | null {
    const source = field ? metadata[field] : metadata
    if (!source || typeof source !== 'object') return null
    const value = source as Record<string, unknown>
    if (value.kind === 'user' && text(value.userId)) return { kind: 'user', userId: value.userId as string }
    if (value.kind === 'agent' && text(value.agentId)) return { kind: 'agent', agentId: value.agentId as string }
    if (text(value.userId)) return { kind: 'user', userId: value.userId as string }
    if (text(value.agentId)) return { kind: 'agent', agentId: value.agentId as string }
    return null
}

export function targetOf(event: ActivityEvent, refs: ActivityRefs): ActivityTarget | null {
    const meta = event.metadata
    switch (event.entityType) {
        case 'issue':
        case 'issue_comment': {
            const known = event.issueId ? refs.issues[event.issueId] : undefined
            return { kind: 'issue', ref: known?.ref ?? text(meta.ref), title: known?.title ?? text(meta.title) }
        }
        case 'project': {
            const known = refs.projects[event.projectId ?? event.entityId]
            return { kind: 'project', key: known?.key ?? text(meta.key), name: known?.name ?? text(meta.name) }
        }
        case 'goal':
            return { kind: 'goal', title: refs.goals[event.entityId]?.title ?? text(meta.title) }
        case 'team':
            return { kind: 'team', name: refs.teams[event.entityId]?.name ?? text(meta.name) }
        case 'channel':
            return { kind: 'channel', id: event.entityId, name: refs.channels[event.entityId]?.name ?? text(meta.name) }
        case 'agent':
            return { kind: 'coworker', agentId: event.entityId }
        default:
            return null
    }
}

// One sentence per action, and a generic one for an action this screen does not know yet: a newer
// server never breaks the feed of an older page.
export function activitySentence(event: ActivityEvent, refs: ActivityRefs): ActivitySentence {
    const target = targetOf(event, refs)
    const key = sentenceKeyOf(event.action)
    if (!key) return { key: target ? 'genericWithTarget' : 'generic', target }
    const meta = event.metadata

    switch (event.action as string) {
        case 'issue.status_changed': {
            const from = issueStatusSchema.safeParse(meta.from)
            const to = issueStatusSchema.safeParse(meta.to)
            return from.success && to.success ? { key, target, status: { of: 'issue', from: from.data, to: to.data } } : { key: 'issueUpdated', target }
        }
        case 'goal.status_changed': {
            const from = goalStatusSchema.safeParse(meta.from)
            const to = goalStatusSchema.safeParse(meta.to)
            return from.success && to.success ? { key, target, status: { of: 'goal', from: from.data, to: to.data } } : { key: 'goalUpdated', target }
        }
        case 'issue.assigned':
            return { key, target, member: memberOf(meta, 'assignee') }
        case 'project.member_granted':
        case 'project.member_revoked':
        case 'team.member_added':
        case 'team.member_removed':
        case 'team.member_role_changed':
            return { key, target, member: memberOf(meta) }
        default:
            return { key, target }
    }
}
