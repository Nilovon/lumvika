import 'server-only'

import { formatIssueRef, type GoalStatus, type IssueCounts, type IssueStatus } from '@lumvika/contracts'

import type { Actor } from '@/app/api/_auth/access'
import { listActivityFeed, type ActivityFeedPage } from '@/app/api/_services/work/activity-feed.service'
import { GOAL_COLUMNS } from '@/app/api/_services/work/columns'
import { toGoal } from '@/app/api/_services/work/mappers'
import { readVisibleProjects } from '@/app/api/_services/work/my-work.service'
import { issueCountsByProject } from '@/app/api/_services/work/projects.service'
import { clientOf, type WorkScope } from '@/app/api/_services/work/refs'
import { buildGoalTree, progressOf, type GoalProgress, type GoalProjectRef, type GoalTreeNode } from '@/lib/work/goal-tree'
import { OPEN_ISSUE_STATUSES } from '@/lib/work/my-work'
import { THROUGHPUT_DAYS } from '@/lib/work/throughput'
import { selectAll } from '@/supabase/supabase-helpers'

export type OverviewProject = { id: string; key: string; name: string; done: number; total: number; inReview: number; blocked: number; updatedAt: string }
export type OverviewGoal = { id: string; title: string; targetDate: string | null; rollup: GoalProgress; projectCount: number }
// A coworker's run that holds an issue right now.
export type CoworkerCheckout = { agentId: string; issueId: string; ref: string; title: string; checkedOutAt: string | null }

export type WorkOverview = {
    counts: { toReview: number; blocked: number; assignedToMe: number }
    // Any project the caller sees, active or not: a workspace with none gets the first steps.
    projectCount: number
    activeProjects: OverviewProject[]
    goals: OverviewGoal[]
    checkouts: CoworkerCheckout[]
    // Every creation and every completion of the window, as timestamps: the reader buckets them by
    // the days of their own time zone.
    throughput: { created: string[]; completed: string[] }
    recent: ActivityFeedPage
}

const RECENT_EVENTS = 8
const DAY_MS = 86_400_000

function sumOf(counts: IssueCounts, statuses: readonly IssueStatus[]): number {
    return statuses.reduce((sum, status) => sum + (counts[status] ?? 0), 0)
}

function activeGoalsOf(roots: readonly GoalTreeNode[]): OverviewGoal[] {
    const active: OverviewGoal[] = []
    const walk = (node: GoalTreeNode) => {
        if (node.status === ('active' satisfies GoalStatus)) active.push({ id: node.id, title: node.title, targetDate: node.targetDate, rollup: node.rollup, projectCount: node.projects.length })
        node.children.forEach(walk)
    }
    roots.forEach(walk)
    return active.sort((a, b) => (a.targetDate ?? '9999').localeCompare(b.targetDate ?? '9999'))
}

// What the overview shows, gathered in two rounds of reads rather than one per tile.
// `visibleProjects` comes from `visibleProjectIds(actor)`.
export async function getWorkOverview(scope: WorkScope, actor: Actor, visible: { projects: 'all' | Set<string>; channels: 'all' | Set<string> }, now: Date = new Date()): Promise<WorkOverview> {
    const visibleProjects = visible.projects
    const visibleChannels = visible.channels
    const supabase = clientOf(scope)
    const workspace = { workspace_id: scope.workspaceId }
    // One extra day so the reader's oldest local day is whole, whatever their time zone.
    const since = new Date(now.getTime() - (THROUGHPUT_DAYS + 1) * DAY_MS).toISOString()
    const userId = actor.kind === 'user' ? actor.userId : null

    const [projects, counts, goals, goalIssues, assigned, checkouts, created, completed, recent] = await Promise.all([
        readVisibleProjects(scope, visibleProjects),
        issueCountsByProject(scope),
        selectAll(supabase, 'goals', GOAL_COLUMNS, workspace, { column: 'created_at', ascending: true }),
        selectAll(supabase, 'issues', ['goal_id', 'project_id', 'status'] as const, { ...workspace, goal_id: { notNull: true } }),
        userId ? selectAll(supabase, 'issues', ['project_id'] as const, { ...workspace, assignee_user_id: userId, status: [...OPEN_ISSUE_STATUSES] }) : Promise.resolve({ data: [], error: null }),
        selectAll(supabase, 'issues', ['id', 'number', 'title', 'project_id', 'assignee_agent_id', 'checked_out_at'] as const, { ...workspace, checkout_run_id: { notNull: true }, assignee_agent_id: { notNull: true } }),
        selectAll(supabase, 'issues', ['project_id', 'created_at'] as const, { ...workspace, created_at: { gte: since } }),
        selectAll(supabase, 'issues', ['project_id', 'completed_at'] as const, { ...workspace, status: 'done', completed_at: { gte: since } }),
        listActivityFeed(scope, { limit: RECENT_EVENTS }, visibleProjects, visibleChannels),
    ])
    for (const read of [goals, goalIssues, assigned, checkouts, created, completed]) if (read.error) throw new Error(`Failed to read the overview: ${read.error.message}`)

    const seen = (projectId: string | null) => !!projectId && (visibleProjects === 'all' || visibleProjects.has(projectId))
    const projectById = new Map(projects.map(project => [project.id, project]))
    const live = projects.filter(project => !project.archivedAt)
    const countsOf = (projectId: string) => counts.get(projectId) ?? {}

    const projectsByGoal = new Map<string, GoalProjectRef[]>()
    for (const project of live) {
        if (!project.goalId) continue
        const ref: GoalProjectRef = { id: project.id, key: project.key, name: project.name, status: project.status, progress: progressOf(countsOf(project.id)) }
        projectsByGoal.set(project.goalId, [...(projectsByGoal.get(project.goalId) ?? []), ref])
    }
    const directCounts = new Map<string, IssueCounts>()
    for (const issue of goalIssues.data ?? []) {
        if (!issue.goal_id || !seen(issue.project_id)) continue
        if ((projectsByGoal.get(issue.goal_id) ?? []).some(project => project.id === issue.project_id)) continue
        const counted = directCounts.get(issue.goal_id) ?? {}
        counted[issue.status] = (counted[issue.status] ?? 0) + 1
        directCounts.set(issue.goal_id, counted)
    }
    const tree = buildGoalTree((goals.data ?? []).map(toGoal), { projectsByGoal, directProgressByGoal: new Map([...directCounts].map(([goalId, byStatus]) => [goalId, progressOf(byStatus)])) })

    const activeProjects = live
        .filter(project => project.status === 'active')
        .map(project => {
            const byStatus = countsOf(project.id)
            const total = sumOf(byStatus, [...OPEN_ISSUE_STATUSES, 'done'])
            return { id: project.id, key: project.key, name: project.name, done: byStatus.done ?? 0, total, inReview: byStatus.in_review ?? 0, blocked: byStatus.blocked ?? 0, updatedAt: project.updatedAt }
        })
        .sort((a, b) => b.inReview + b.blocked - (a.inReview + a.blocked) || b.total - b.done - (a.total - a.done) || a.name.localeCompare(b.name))

    return {
        counts: {
            toReview: live.reduce((sum, project) => sum + (countsOf(project.id).in_review ?? 0), 0),
            blocked: live.reduce((sum, project) => sum + (countsOf(project.id).blocked ?? 0), 0),
            assignedToMe: (assigned.data ?? []).filter(issue => seen(issue.project_id)).length,
        },
        projectCount: projects.length,
        activeProjects,
        goals: activeGoalsOf(tree),
        checkouts: (checkouts.data ?? []).flatMap(issue => {
            const project = projectById.get(issue.project_id)
            if (!project || !issue.assignee_agent_id) return []
            return [{ agentId: issue.assignee_agent_id, issueId: issue.id, ref: formatIssueRef(project.key, issue.number), title: issue.title, checkedOutAt: issue.checked_out_at }]
        }),
        throughput: {
            created: (created.data ?? []).filter(issue => seen(issue.project_id)).map(issue => issue.created_at),
            completed: (completed.data ?? []).flatMap(issue => (seen(issue.project_id) && issue.completed_at ? [issue.completed_at] : [])),
        },
        recent,
    }
}
