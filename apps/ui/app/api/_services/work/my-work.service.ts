import 'server-only'

import type { IssueSummary, ProjectStatus } from '@lumvika/contracts'

import { listIssues } from '@/app/api/_services/work/issues.service'
import { dbOf, type WorkScope } from '@/app/api/_services/work/refs'
import { mergeIssues, OPEN_ISSUE_STATUSES, openFirst } from '@/lib/work/my-work'
import type { WorkProjectRef } from '@/lib/work/review-queue'
import { selectAll } from '@/lib/db'

export type MyWork = {
    // Open issues assigned to the caller.
    assigned: IssueSummary[]
    // What the caller created, open ones first.
    created: IssueSummary[]
    // Open issues held by a coworker that the caller created or whose project they lead.
    delegated: IssueSummary[]
    projects: WorkProjectRef[]
}

const ASSIGNED_LIMIT = 500
const CREATED_LIMIT = 200
const DELEGATED_LIMIT = 300

export type WorkProjectFacts = WorkProjectRef & { leadUserId: string | null; leadAgentId: string | null; status: ProjectStatus; goalId: string | null; archivedAt: string | null; updatedAt: string }

// Every project of the workspace the caller sees, light: enough to name a project and know its lead.
export async function readVisibleProjects(scope: WorkScope, visibleProjects: 'all' | Set<string>): Promise<WorkProjectFacts[]> {
    const { data, error } = await selectAll(dbOf(scope), 'projects', ['id', 'key', 'name', 'lead_user_id', 'lead_agent_id', 'status', 'goal_id', 'archived_at', 'updated_at'] as const, { workspace_id: scope.workspaceId }, { column: 'name', ascending: true })
    if (error) throw new Error(`Failed to read the projects: ${error.message}`)
    return (data ?? [])
        .filter(row => visibleProjects === 'all' || visibleProjects.has(row.id))
        .map(row => ({ id: row.id, key: row.key, name: row.name, leadUserId: row.lead_user_id, leadAgentId: row.lead_agent_id, status: row.status, goalId: row.goal_id, archivedAt: row.archived_at, updatedAt: row.updated_at }))
}

// The three lists of "My work" in one call. `visibleProjects` comes from `visibleProjectIds(actor)`.
export async function listMyWork(scope: WorkScope, userId: string, visibleProjects: 'all' | Set<string>): Promise<MyWork> {
    const projects = await readVisibleProjects(scope, visibleProjects)
    const led = new Set(projects.filter(project => project.leadUserId === userId).map(project => project.id))
    const me = { kind: 'user', userId } as const
    const open = [...OPEN_ISSUE_STATUSES]

    const [assigned, created, delegatedByMe, delegatedInLed] = await Promise.all([
        listIssues(scope, { assignee: me, status: open, sort: 'updated', limit: ASSIGNED_LIMIT }, visibleProjects),
        listIssues(scope, { createdBy: me, sort: 'updated', limit: CREATED_LIMIT }, visibleProjects),
        listIssues(scope, { createdBy: me, assigneeKind: 'agent', status: open, sort: 'updated', limit: DELEGATED_LIMIT }, visibleProjects),
        led.size > 0 ? listIssues(scope, { assigneeKind: 'agent', status: open, sort: 'updated', limit: DELEGATED_LIMIT }, led) : Promise.resolve([]),
    ])

    return {
        assigned,
        created: openFirst(created),
        delegated: mergeIssues(delegatedByMe, delegatedInLed),
        projects: projects.map(({ id, key, name }) => ({ id, key, name })),
    }
}
