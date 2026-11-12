import 'server-only'

import { formatIssueRef, type ActivityEvent } from '@lumvika/contracts'

import { listActivity, type ActivityPage, type ActivityQuery } from '@/app/api/_services/work/activity.service'
import { clientOf, type WorkScope } from '@/app/api/_services/work/refs'
import { selectAll } from '@/supabase/supabase-helpers'

// The names an event of the feed links to, read once for a whole page: an event only keeps ids.
export type ActivityRefs = {
    issues: Record<string, { ref: string; title: string }>
    projects: Record<string, { key: string; name: string }>
    goals: Record<string, { title: string }>
    teams: Record<string, { name: string }>
    channels: Record<string, { name: string }>
}

export type ActivityFeedPage = ActivityPage & { refs: ActivityRefs }

export const EMPTY_ACTIVITY_REFS: ActivityRefs = { issues: {}, projects: {}, goals: {}, teams: {}, channels: {} }

function idsOf(events: readonly ActivityEvent[], pick: (event: ActivityEvent) => string | null | undefined): string[] {
    return [...new Set(events.map(pick).filter((id): id is string => !!id))]
}

export async function resolveActivityRefs(scope: WorkScope, events: readonly ActivityEvent[]): Promise<ActivityRefs> {
    if (events.length === 0) return EMPTY_ACTIVITY_REFS
    const supabase = clientOf(scope)
    const workspace = { workspace_id: scope.workspaceId }
    const entityIds = (type: ActivityEvent['entityType']) => idsOf(events, event => (event.entityType === type ? event.entityId : null))
    const issueIds = idsOf(events, event => event.issueId)
    const goalIds = entityIds('goal')
    const teamIds = entityIds('team')
    const channelIds = entityIds('channel')

    const none = Promise.resolve({ data: [], error: null })
    const [issues, goals, teams, channels] = await Promise.all([
        issueIds.length ? selectAll(supabase, 'issues', ['id', 'number', 'title', 'project_id'] as const, { ...workspace, id: issueIds }) : none,
        goalIds.length ? selectAll(supabase, 'goals', ['id', 'title'] as const, { ...workspace, id: goalIds }) : none,
        teamIds.length ? selectAll(supabase, 'teams', ['id', 'name'] as const, { ...workspace, id: teamIds }) : none,
        channelIds.length ? selectAll(supabase, 'channels', ['id', 'name'] as const, { ...workspace, id: channelIds }) : none,
    ])
    const projectIds = [...new Set([...idsOf(events, event => event.projectId), ...(issues.data ?? []).map(issue => issue.project_id)])]
    const projects = projectIds.length ? await selectAll(supabase, 'projects', ['id', 'key', 'name'] as const, { ...workspace, id: projectIds }) : { data: [] }

    const projectById = new Map((projects.data ?? []).map(project => [project.id, project]))
    const refs: ActivityRefs = { issues: {}, projects: {}, goals: {}, teams: {}, channels: {} }
    for (const project of projects.data ?? []) refs.projects[project.id] = { key: project.key, name: project.name }
    for (const issue of issues.data ?? []) {
        const project = projectById.get(issue.project_id)
        if (project) refs.issues[issue.id] = { ref: formatIssueRef(project.key, issue.number), title: issue.title }
    }
    for (const goal of goals.data ?? []) refs.goals[goal.id] = { title: goal.title }
    for (const team of teams.data ?? []) refs.teams[team.id] = { name: team.name }
    for (const channel of channels.data ?? []) refs.channels[channel.id] = { name: channel.name }
    return refs
}

// A page of the workspace feed with the names it links to. A channel event the caller cannot see
// (a private channel, a direct message between others) is left out, as the channel is.
export async function listActivityFeed(scope: WorkScope, query: ActivityQuery, visibleProjects: 'all' | Set<string>, visibleChannels: 'all' | Set<string>): Promise<ActivityFeedPage> {
    const page = await listActivity(scope, query, visibleProjects)
    const events = visibleChannels === 'all' ? page.events : page.events.filter(event => event.entityType !== 'channel' || visibleChannels.has(event.entityId))
    return { events, nextCursor: page.nextCursor, refs: await resolveActivityRefs(scope, events) }
}
