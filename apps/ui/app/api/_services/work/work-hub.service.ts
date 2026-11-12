import 'server-only'

import {
    AGENT_ISSUE_STATUSES,
    ISSUE_PRIORITIES,
    ISSUE_STATUSES,
    ISSUE_TRANSITIONS,
    WORK_TOOL_NAMES,
    canTransitionIssue,
    formatIssueRef,
    parseIssueRef,
    type AgentIssueStatus,
    type IssueDetail,
    type IssuePriority,
    type IssueStatus,
    type IssueSummary,
    type WorkAuthor,
    type WorkMemberRef,
    type WorkToolName,
} from '@lumvika/contracts'

import { workspaceActor } from '@/app/api/_auth/access'
import { coworkerVisibleProjectIds } from '@/app/api/_auth/project-access'
import { resolveAgentTarget } from '@/app/api/_services/chat.service'
import { resolveMemberIdentities } from '@/app/api/_services/members.service'
import { addIssueComment, listIssueComments } from '@/app/api/_services/work/issue-comments.service'
import { checkoutIssue, createIssue, getIssueByRef, listIssues, releaseIssue, transitionIssue, type CheckoutConflict } from '@/app/api/_services/work/issues.service'
import { listProjects } from '@/app/api/_services/work/projects.service'
import { clientOf, type WorkScope } from '@/app/api/_services/work/refs'
import { getAgent } from '@/lib/engine/client'
import { asNumber, asString, clamp } from '@/lib/mcp/args'
import { createServiceRoleClient } from '@/supabase/serviceRole'
import { selectMany, selectMaybeSingle } from '@/supabase/supabase-helpers'

// The `work` tools of a coworker (engine `tools/builtin/work.ts`), answered for the coworker the
// engine key and the agent header name. A coworker sees the projects `coworkerVisibleProjectIds`
// lets through (a restricted one it is not involved in does not exist for it), comments and creates
// in those, and takes, lets go of and moves only the issues assigned to it. Every refusal is a
// sentence the model can act on.

const WORK_TOOLS = new Set<string>(WORK_TOOL_NAMES)

export function isWorkHubTool(name: string): name is WorkToolName {
    return WORK_TOOLS.has(name)
}

const INBOX_STATUSES = ['in_progress', 'todo', 'blocked'] as const satisfies readonly IssueStatus[]
const STATUS_RANK: Partial<Record<IssueStatus, number>> = { in_progress: 0, todo: 1, blocked: 2 }
const PRIORITY_RANK: Record<IssuePriority, number> = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 }
const INBOX_SCAN = 200
const LIST_DEFAULT = 50
const LIST_MAX = 100
const COMMENTS_SHOWN = 50
const SELF_NAMES = new Set(['me', 'self', 'myself'])

type Caller = { agentId: string; scope: WorkScope; visible: Set<string> }
type Coworker = { id: string; name: string; handle: string | null }
type Directory = { coworkers: Map<string, Coworker>; people: Map<string, string> }

const authorOf = (caller: Caller): WorkAuthor => ({ kind: 'agent', agentId: caller.agentId })

async function assertWorkSwitchedOn(agentId: string, workspaceId: number): Promise<void> {
    const { conn, engineAgentId } = await resolveAgentTarget(agentId, workspaceActor(workspaceId))
    const { config } = await getAgent(conn, engineAgentId)
    if (config.tools.work === false) throw new Error('Working on the board is switched off for this coworker.')
}

async function coworkersOf(scope: WorkScope): Promise<Map<string, Coworker>> {
    const { data } = await selectMany(clientOf(scope), 'agents', ['id', 'name', 'handle'] as const, { workspace_id: scope.workspaceId })
    return new Map((data ?? []).map(agent => [agent.id, agent]))
}

async function directoryOf(scope: WorkScope, userIds: Iterable<string | null | undefined>): Promise<Directory> {
    const ids = [...new Set([...userIds].filter((id): id is string => !!id))]
    const [coworkers, identities] = await Promise.all([coworkersOf(scope), ids.length ? resolveMemberIdentities(clientOf(scope), ids).catch(() => new Map()) : Promise.resolve(new Map())])
    return { coworkers, people: new Map(ids.map(id => [id, identities.get(id)?.name ?? 'a teammate'])) }
}

function coworkerLabel(coworker: Coworker | undefined): string {
    if (!coworker) return 'a former coworker'
    return coworker.handle ? `${coworker.name} (@${coworker.handle})` : coworker.name
}

function labelOf(directory: Directory, caller: Caller, who: WorkAuthor | WorkMemberRef | null): string | null {
    if (!who) return null
    if (who.kind === 'system') return 'Lumvika'
    if (who.kind === 'agent') return who.agentId === caller.agentId ? 'you' : coworkerLabel(directory.coworkers.get(who.agentId))
    return directory.people.get(who.userId) ?? 'a teammate'
}

function personIdOf(who: WorkAuthor | WorkMemberRef | null): string | null {
    return who?.kind === 'user' ? who.userId : null
}

function normalizeHandle(value: string): string {
    return value.trim().replace(/^@/, '').toLowerCase()
}

function unknownCoworker(value: string): string {
    return `No coworker goes by "${value}". Pass a handle as team_status or the issue lists show it, or 'me'.`
}

async function resolveAssignee(caller: Caller, value: string): Promise<WorkMemberRef> {
    const wanted = normalizeHandle(value)
    if (SELF_NAMES.has(wanted)) return { kind: 'agent', agentId: caller.agentId }
    const coworkers = [...(await coworkersOf(caller.scope)).values()]
    const match = coworkers.find(c => c.handle?.toLowerCase() === wanted) ?? coworkers.find(c => c.name.toLowerCase() === wanted)
    if (!match) throw new Error(unknownCoworker(value))
    return { kind: 'agent', agentId: match.id }
}

// Whom a coworker may hand an issue to: itself, a coworker of its own Box, or someone on its
// reporting line (its manager, its direct reports). Anyone else answers like a handle nobody has, so
// a coworker never learns of, nor sets to work, one in a Box its people may not reach.
async function resolveDelegate(caller: Caller, value: string): Promise<WorkMemberRef> {
    const assignee = await resolveAssignee(caller, value)
    if (assignee.kind !== 'agent' || assignee.agentId === caller.agentId) return assignee
    const { data: pair } = await selectMany(clientOf(caller.scope), 'agents', ['id', 'space_id', 'reports_to_agent_id'] as const, { workspace_id: caller.scope.workspaceId, id: [caller.agentId, assignee.agentId] })
    const self = pair?.find(agent => agent.id === caller.agentId)
    const other = pair?.find(agent => agent.id === assignee.agentId)
    const related = !!self && !!other && (self.space_id === other.space_id || self.reports_to_agent_id === other.id || other.reports_to_agent_id === self.id)
    if (!related) throw new Error(unknownCoworker(value))
    return assignee
}

async function requireIssue(caller: Caller, ref: unknown): Promise<IssueDetail> {
    const reference = typeof ref === 'string' ? ref.trim() : ''
    if (!parseIssueRef(reference)) throw new Error(`"${reference}" is not an issue reference: write it as ENG-12.`)
    const issue = await getIssueByRef(caller.scope, reference, caller.visible)
    if (!issue) throw new Error(`No issue ${reference.toUpperCase()} in this workspace.`)
    return issue
}

async function requireProjectByKey(caller: Caller, key: string): Promise<{ id: string; key: string }> {
    const { data } = await selectMaybeSingle(clientOf(caller.scope), 'projects', ['id', 'key'] as const, { workspace_id: caller.scope.workspaceId, key: key.trim().toUpperCase() })
    if (!data || !caller.visible.has(data.id)) throw new Error(`No project with the key ${key.trim().toUpperCase()}. work_list_projects lists them.`)
    return data
}

function isMine(caller: Caller, issue: Pick<IssueSummary, 'assignee'>): boolean {
    return issue.assignee?.kind === 'agent' && issue.assignee.agentId === caller.agentId
}

async function refsByIssueId(scope: WorkScope, issueIds: string[], projectKeys: Map<string, string>): Promise<Map<string, string>> {
    if (issueIds.length === 0) return new Map()
    const { data } = await selectMany(clientOf(scope), 'issues', ['id', 'project_id', 'number'] as const, { workspace_id: scope.workspaceId, id: issueIds })
    return new Map((data ?? []).map(row => [row.id, formatIssueRef(projectKeys.get(row.project_id) ?? '?', row.number)]))
}

async function projectsById(scope: WorkScope): Promise<Map<string, { key: string; name: string }>> {
    const { data } = await selectMany(clientOf(scope), 'projects', ['id', 'key', 'name'] as const, { workspace_id: scope.workspaceId })
    return new Map((data ?? []).map(project => [project.id, { key: project.key, name: project.name }]))
}

function byWorkingOrder(a: IssueSummary, b: IssueSummary): number {
    return (
        (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9) ||
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
        (a.dueDate ?? '9999-12-31').localeCompare(b.dueDate ?? '9999-12-31') ||
        a.position - b.position
    )
}

async function inbox(caller: Caller, args: Record<string, unknown>) {
    const runId = asString(args.runId)
    const [issues, projects] = await Promise.all([listIssues(caller.scope, { assignee: { kind: 'agent', agentId: caller.agentId }, status: [...INBOX_STATUSES], sort: 'updated', limit: INBOX_SCAN }, caller.visible), projectsById(caller.scope)])
    const keys = new Map([...projects].map(([id, project]) => [id, project.key]))
    const parents = await refsByIssueId(caller.scope, [...new Set(issues.flatMap(issue => (issue.parentIssueId ? [issue.parentIssueId] : [])))], keys)
    const ordered = [...issues].sort(byWorkingOrder)
    return {
        issues: ordered.map(issue => ({
            ref: issue.ref,
            title: issue.title,
            status: issue.status,
            priority: issue.priority,
            project: projects.get(issue.projectId)?.name ?? null,
            parent: issue.parentIssueId ? (parents.get(issue.parentIssueId) ?? null) : null,
            dueDate: issue.dueDate,
            heldByAnotherRun: !!issue.checkoutRunId && issue.checkoutRunId !== runId,
        })),
        ...(ordered.length === 0 ? { note: 'Nothing assigned to you is open.' } : {}),
    }
}

async function getIssueForAgent(caller: Caller, args: Record<string, unknown>) {
    const issue = await requireIssue(caller, args.ref)
    const supabase = clientOf(caller.scope)
    const [{ data: project }, { data: parent }, comments, { data: assignments }] = await Promise.all([
        selectMaybeSingle(supabase, 'projects', ['key', 'name', 'instructions', 'goal_id', 'lead_user_id', 'lead_agent_id'] as const, { id: issue.projectId }),
        issue.parentIssueId ? selectMaybeSingle(supabase, 'issues', ['number', 'title', 'status'] as const, { id: issue.parentIssueId, workspace_id: caller.scope.workspaceId }) : Promise.resolve({ data: null }),
        listIssueComments(caller.scope, issue.id),
        selectMany(supabase, 'activity_events', ['actor_user_id', 'actor_agent_id'] as const, { issue_id: issue.id, action: 'issue.assigned' }, { column: 'created_at', ascending: false }, 1),
    ])
    const goalId = issue.goalId ?? project?.goal_id ?? null
    const { data: goal } = goalId ? await selectMaybeSingle(supabase, 'goals', ['title', 'status'] as const, { id: goalId, workspace_id: caller.scope.workspaceId }) : { data: null }

    const shownComments = comments.slice(-COMMENTS_SHOWN)
    const assignedBy = assignments?.[0] ? (assignments[0].actor_user_id ? { kind: 'user' as const, userId: assignments[0].actor_user_id } : assignments[0].actor_agent_id ? { kind: 'agent' as const, agentId: assignments[0].actor_agent_id } : { kind: 'system' as const }) : null
    const directory = await directoryOf(caller.scope, [personIdOf(issue.createdBy), personIdOf(issue.assignee), personIdOf(assignedBy), project?.lead_user_id, ...shownComments.map(comment => personIdOf(comment.author)), ...issue.subIssues.map(sub => personIdOf(sub.assignee))])
    const label = (who: WorkAuthor | WorkMemberRef | null) => labelOf(directory, caller, who)

    return {
        ref: issue.ref,
        title: issue.title,
        status: issue.status,
        priority: issue.priority,
        description: issue.description,
        blockedReason: issue.blockedReason,
        dueDate: issue.dueDate,
        assignee: label(issue.assignee),
        assignedBy: label(assignedBy),
        createdBy: label(issue.createdBy),
        // Who checks the work: only an issue a coworker created can close itself; one a person, the
        // system or an API key filed goes to review.
        needsReview: issue.createdBy.kind !== 'agent',
        checkedOut: !!issue.checkoutRunId,
        project: project ? { key: project.key, name: project.name, instructions: project.instructions, lead: label(project.lead_user_id ? { kind: 'user', userId: project.lead_user_id } : project.lead_agent_id ? { kind: 'agent', agentId: project.lead_agent_id } : null) } : null,
        goal: goal ? { title: goal.title, status: goal.status } : null,
        parent: parent && project ? { ref: formatIssueRef(project.key, parent.number), title: parent.title, status: parent.status } : null,
        subIssues: issue.subIssues.map(sub => ({ ref: sub.ref, title: sub.title, status: sub.status, assignee: label(sub.assignee) })),
        comments: shownComments.map(comment => ({ author: label(comment.author), body: comment.body, at: comment.createdAt })),
        ...(comments.length > shownComments.length ? { olderComments: comments.length - shownComments.length } : {}),
    }
}

const CHECKOUT_REFUSALS: Record<Exclude<CheckoutConflict, 'checked_out'>, (ref: string) => string> = {
    not_found: ref => `No issue ${ref} in this workspace.`,
    not_assigned: ref => `${ref} is not assigned to you, so you cannot take it. Comment on it, or create a sub-issue for your part.`,
    not_ready: ref => `${ref} is not in todo, in_progress or blocked, so it cannot be taken. Read it with work_get_issue to see where it stands.`,
}

async function checkout(caller: Caller, args: Record<string, unknown>) {
    const runId = asString(args.runId)
    if (!runId) throw new Error('This run has no id, so it cannot hold an issue.')
    const issue = await requireIssue(caller, args.ref)
    const engineSessionId = asString(args.sessionId)
    const { data: session } = engineSessionId ? await selectMaybeSingle(clientOf(caller.scope), 'sessions', ['id'] as const, { agent_id: caller.agentId, engine_session_id: engineSessionId }) : { data: null }
    const result = await checkoutIssue(caller.scope, issue.id, caller.agentId, runId, session ? { sessionId: session.id } : {})
    if (result.ok) return { ref: result.issue.ref, status: result.issue.status, checkedOut: true, message: `You hold ${result.issue.ref} until this run ends. Work on it, comment what matters, then move it with work_update_status.` }
    if (result.reason === 'checked_out') return { ref: issue.ref, checkedOut: false, heldByRunId: result.heldByRunId, message: `${issue.ref} is already held by another run that is working on it. Do not retry and do not work on it: move on to the next issue of your inbox, or stop.` }
    return { ref: issue.ref, checkedOut: false, message: CHECKOUT_REFUSALS[result.reason](issue.ref) }
}

function readAgentStatus(value: unknown): AgentIssueStatus {
    const status = (AGENT_ISSUE_STATUSES as readonly string[]).find(candidate => candidate === value)
    if (!status) throw new Error(`A coworker moves an issue to one of: ${AGENT_ISSUE_STATUSES.join(', ')}.`)
    return status as AgentIssueStatus
}

async function updateStatus(caller: Caller, args: Record<string, unknown>) {
    const to = readAgentStatus(args.status)
    const issue = await requireIssue(caller, args.ref)
    if (!isMine(caller, issue)) throw new Error(`${issue.ref} is not assigned to you: only its assignee moves it. Comment on it instead.`)
    const blockedReason = asString(args.blockedReason)?.trim()
    if (to === 'blocked' && !blockedReason) throw new Error('Say who must do what in blockedReason, e.g. "Anna must share the Stripe API key".')
    const createdByCoworker = issue.createdBy.kind === 'agent'
    if (to === 'done' && !createdByCoworker) throw new Error(`${issue.ref} was not created by a coworker: move it to in_review so a person can check the work.`)
    if (to === 'cancelled' && !createdByCoworker) throw new Error(`${issue.ref} was not created by a coworker, so only a person can cancel it. Move it to blocked and say why it should be dropped.`)
    if (issue.status !== to && !canTransitionIssue(issue.status, to)) {
        throw new Error(`${issue.ref} cannot go from ${issue.status} to ${to}. From ${issue.status} it can go to: ${ISSUE_TRANSITIONS[issue.status].join(', ')}.`)
    }

    const comment = asString(args.comment)?.trim()
    if (comment) await addIssueComment(caller.scope, authorOf(caller), issue.id, { body: comment })
    const moved = await transitionIssue(caller.scope, authorOf(caller), issue.id, to, { blockedReason: to === 'blocked' ? blockedReason : undefined })
    const runId = asString(args.runId)
    if (runId && (to === 'todo' || to === 'blocked')) await releaseIssue(caller.scope, authorOf(caller), issue.id, { runId })
    return { ref: moved.ref, status: moved.status, ...(comment ? { commented: true } : {}) }
}

async function comment(caller: Caller, args: Record<string, unknown>) {
    const issue = await requireIssue(caller, args.ref)
    const added = await addIssueComment(caller.scope, authorOf(caller), issue.id, { body: asString(args.body) ?? '' })
    return { ref: issue.ref, commentId: added.id }
}

function readPriority(value: unknown): IssuePriority | undefined {
    if (value === undefined) return undefined
    const priority = (ISSUE_PRIORITIES as readonly string[]).find(candidate => candidate === value)
    if (!priority) throw new Error(`priority is one of: ${ISSUE_PRIORITIES.join(', ')}.`)
    return priority as IssuePriority
}

async function create(caller: Caller, args: Record<string, unknown>) {
    const title = asString(args.title)?.trim()
    if (!title) throw new Error('Give the issue a title.')
    const parentRef = asString(args.parentRef)
    const projectKey = asString(args.projectKey)
    const parent = parentRef ? await requireIssue(caller, parentRef) : null
    const projectId = parent?.projectId ?? (projectKey ? (await requireProjectByKey(caller, projectKey)).id : null)
    if (!projectId) throw new Error('Name the project with projectKey, or the issue it belongs under with parentRef.')
    const assigneeName = asString(args.assignee)
    const assignee = assigneeName ? await resolveDelegate(caller, assigneeName) : null
    const status = args.status === 'backlog' || args.status === 'todo' ? args.status : assignee ? 'todo' : 'backlog'

    const issue = await createIssue(caller.scope, authorOf(caller), {
        projectId,
        title,
        description: asString(args.description) ?? null,
        priority: readPriority(args.priority),
        dueDate: asString(args.dueDate) ?? null,
        parentIssueId: parent?.id ?? null,
        assignee,
        status,
    })
    const handedOver = assignee?.kind === 'agent' && assignee.agentId !== caller.agentId && status === 'todo'
    return { ref: issue.ref, status: issue.status, ...(handedOver ? { message: `${issue.ref} is assigned, and its coworker is woken to work on it.` } : {}) }
}

function readStatuses(value: unknown): IssueStatus[] | undefined {
    if (value === undefined) return undefined
    const list = Array.isArray(value) ? value : [value]
    const unknown = list.find(status => !(ISSUE_STATUSES as readonly unknown[]).includes(status))
    if (unknown !== undefined) throw new Error(`status is a list of: ${ISSUE_STATUSES.join(', ')}.`)
    return list as IssueStatus[]
}

async function listForAgent(caller: Caller, args: Record<string, unknown>) {
    const projectKey = asString(args.projectKey)
    const project = projectKey ? await requireProjectByKey(caller, projectKey) : null
    const assigneeName = asString(args.assignee)
    const assignee = !assigneeName ? undefined : normalizeHandle(assigneeName) === 'unassigned' ? ('unassigned' as const) : await resolveAssignee(caller, assigneeName)
    const limit = clamp(asNumber(args.limit), LIST_DEFAULT, LIST_MAX)
    const [issues, projects] = await Promise.all([
        listIssues(caller.scope, { projectId: project?.id, status: readStatuses(args.status), assignee, text: asString(args.text), sort: 'updated', limit }, caller.visible),
        projectsById(caller.scope),
    ])
    const directory = await directoryOf(caller.scope, issues.map(issue => personIdOf(issue.assignee)))
    return {
        issues: issues.map(issue => ({ ref: issue.ref, title: issue.title, status: issue.status, priority: issue.priority, project: projects.get(issue.projectId)?.name ?? null, assignee: labelOf(directory, caller, issue.assignee), dueDate: issue.dueDate, updatedAt: issue.updatedAt })),
        ...(issues.length === limit ? { note: `Showing the ${limit} most recently updated. Narrow the filters to see others.` } : {}),
    }
}

async function listProjectsForAgent(caller: Caller) {
    const projects = (await listProjects(caller.scope, workspaceActor(caller.scope.workspaceId))).filter(project => caller.visible.has(project.id))
    const directory = await directoryOf(caller.scope, projects.map(project => personIdOf(project.lead)))
    return { projects: projects.map(project => ({ key: project.key, name: project.name, description: project.description, status: project.status, lead: labelOf(directory, caller, project.lead), targetDate: project.targetDate, issueCounts: project.issueCounts })) }
}

export async function dispatchWorkHubTool(callerAgentId: string, workspaceId: number, name: WorkToolName, args: Record<string, unknown>): Promise<unknown> {
    await assertWorkSwitchedOn(callerAgentId, workspaceId)
    const caller: Caller = { agentId: callerAgentId, scope: { workspaceId, supabase: createServiceRoleClient() }, visible: await coworkerVisibleProjectIds(workspaceId, callerAgentId) }
    switch (name) {
        case 'work_inbox':
            return inbox(caller, args)
        case 'work_get_issue':
            return getIssueForAgent(caller, args)
        case 'work_checkout':
            return checkout(caller, args)
        case 'work_update_status':
            return updateStatus(caller, args)
        case 'work_comment':
            return comment(caller, args)
        case 'work_create_issue':
            return create(caller, args)
        case 'work_list_issues':
            return listForAgent(caller, args)
        case 'work_list_projects':
            return listProjectsForAgent(caller)
    }
}
