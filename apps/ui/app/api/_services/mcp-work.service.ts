import 'server-only'

import { workMemberRefSchema, type IssueStatus, type WorkAuthor, type WorkMemberRef } from '@lumvika/contracts'

import { visibleAgentIds, type Actor } from '@/app/api/_auth/access'
import { assertIssueAccess, assertProjectAccessByKey, visibleProjectIds } from '@/app/api/_auth/project-access'
import { addIssueComment, listIssueComments } from '@/app/api/_services/work/issue-comments.service'
import { assignIssue, createIssue, getIssueByRef, listIssues, transitionIssue, updateIssue } from '@/app/api/_services/work/issues.service'
import { listProjects } from '@/app/api/_services/work/projects.service'
import type { WorkScope } from '@/app/api/_services/work/refs'
import { asNumber, asString, clamp, requireString } from '@/lib/mcp/args'
import { WORK_ACCOUNT_TOOL_DEFS } from '@/lib/mcp/work-tools'
import { createServiceRoleClient } from '@/supabase/serviceRole'
import { selectMaybeSingle } from '@/supabase/supabase-helpers'

// The projects half of the account server (lib/mcp/work-tools.ts). Every call goes through the same
// project guards as the app, with the access of the member who created the key: a restricted project
// they are not on reads as missing.

const WORK_ACCOUNT_TOOLS = new Set<string>(WORK_ACCOUNT_TOOL_DEFS.map(def => def.name))
const LIST_DEFAULT = 50
const LIST_MAX = 200

export function isWorkAccountTool(name: string): boolean {
    return WORK_ACCOUNT_TOOLS.has(name)
}

function scopeOf(actor: Actor): WorkScope {
    return { workspaceId: actor.workspaceId, supabase: createServiceRoleClient() }
}

function authorOf(actor: Actor): WorkAuthor {
    return actor.kind === 'user' ? { kind: 'user', userId: actor.userId } : { kind: 'system' }
}

// A coworker is assigned only if the key can see it; a member only if they belong to the workspace,
// which the service checks.
async function readAssignee(actor: Actor, value: unknown): Promise<WorkMemberRef | null> {
    if (value === null) return null
    const parsed = workMemberRefSchema.safeParse(value)
    if (!parsed.success) throw new Error('assignee is {"kind": "agent", "agentId": "…"}, {"kind": "user", "userId": "…"} or null.')
    if (parsed.data.kind === 'agent') {
        const visible = await visibleAgentIds(actor)
        if (visible !== 'all' && !visible.has(parsed.data.agentId)) throw new Error(`No coworker ${parsed.data.agentId} on this account. list_agents lists them.`)
    }
    return parsed.data
}

async function issueOf(actor: Actor, ref: unknown) {
    const reference = requireString(ref, 'ref')
    const issue = await getIssueByRef(scopeOf(actor), reference, await visibleProjectIds(actor))
    if (!issue) throw new Error(`No issue ${reference.toUpperCase()} on this account.`)
    return issue
}

async function listIssuesForKey(actor: Actor, args: Record<string, unknown>) {
    const scope = scopeOf(actor)
    const visible = await visibleProjectIds(actor)
    const projectKey = asString(args.projectKey)
    const project = projectKey ? (await assertProjectAccessByKey(projectKey, 'use', actor)).project : null
    const parent = asString(args.parentRef) ? await issueOf(actor, args.parentRef) : null
    const assigneeArg = asString(args.assignee)
    const { data: agent } = assigneeArg && assigneeArg !== 'unassigned' ? await selectMaybeSingle(createServiceRoleClient(), 'agents', ['id'] as const, { id: assigneeArg, workspace_id: actor.workspaceId }) : { data: null }
    const assignee = !assigneeArg ? undefined : assigneeArg === 'unassigned' ? ('unassigned' as const) : agent ? { kind: 'agent' as const, agentId: agent.id } : { kind: 'user' as const, userId: assigneeArg }
    const issues = await listIssues(
        scope,
        {
            projectId: project?.id,
            parentIssueId: parent?.id,
            status: Array.isArray(args.status) ? (args.status as IssueStatus[]) : undefined,
            assignee,
            text: asString(args.text),
            sort: 'updated',
            limit: clamp(asNumber(args.limit), LIST_DEFAULT, LIST_MAX),
        },
        visible,
    )
    return {
        issues: issues.map(issue => ({ ref: issue.ref, title: issue.title, status: issue.status, priority: issue.priority, assignee: issue.assignee, parentIssueId: issue.parentIssueId, dueDate: issue.dueDate, updatedAt: issue.updatedAt })),
    }
}

async function getIssueForKey(actor: Actor, args: Record<string, unknown>) {
    const issue = await issueOf(actor, args.ref)
    const comments = await listIssueComments(scopeOf(actor), issue.id)
    return {
        ref: issue.ref,
        title: issue.title,
        description: issue.description,
        status: issue.status,
        priority: issue.priority,
        assignee: issue.assignee,
        createdBy: issue.createdBy,
        blockedReason: issue.blockedReason,
        dueDate: issue.dueDate,
        parentIssueId: issue.parentIssueId,
        subIssues: issue.subIssues.map(sub => ({ ref: sub.ref, title: sub.title, status: sub.status, assignee: sub.assignee })),
        startedAt: issue.startedAt,
        completedAt: issue.completedAt,
        createdAt: issue.createdAt,
        updatedAt: issue.updatedAt,
        beingWorkedOn: !!issue.checkoutRunId,
        comments: comments.map(comment => ({ author: comment.author, body: comment.body, createdAt: comment.createdAt, editedAt: comment.editedAt })),
    }
}

async function createIssueForKey(actor: Actor, args: Record<string, unknown>) {
    const parent = asString(args.parentRef) ? await issueOf(actor, args.parentRef) : null
    const projectKey = asString(args.projectKey)
    if (!parent && !projectKey) throw new Error('Pass projectKey (from list_projects), or parentRef for a sub-issue.')
    const { project } = parent ? await assertIssueAccess(parent.id, 'use', actor) : await assertProjectAccessByKey(projectKey!, 'use', actor)
    const issue = await createIssue(scopeOf(actor), authorOf(actor), {
        projectId: project.id,
        parentIssueId: parent?.id ?? null,
        title: requireString(args.title, 'title'),
        description: asString(args.description) ?? null,
        status: args.status as IssueStatus | undefined,
        priority: args.priority as never,
        dueDate: asString(args.dueDate) ?? null,
        assignee: args.assignee === undefined ? null : await readAssignee(actor, args.assignee),
    })
    return { ref: issue.ref, id: issue.id, status: issue.status }
}

async function updateIssueForKey(actor: Actor, args: Record<string, unknown>) {
    const current = await issueOf(actor, args.ref)
    await assertIssueAccess(current.id, 'use', actor)
    const scope = scopeOf(actor)
    const author = authorOf(actor)
    const fields = Object.fromEntries((['title', 'description', 'priority', 'dueDate'] as const).filter(key => args[key] !== undefined).map(key => [key, args[key]]))
    if (Object.keys(fields).length > 0) await updateIssue(scope, author, current.id, fields)
    if (args.assignee !== undefined) await assignIssue(scope, author, current.id, await readAssignee(actor, args.assignee))
    if (args.status !== undefined) await transitionIssue(scope, author, current.id, args.status as IssueStatus, { blockedReason: asString(args.blockedReason) ?? null })
    else if (args.blockedReason !== undefined) await updateIssue(scope, author, current.id, { blockedReason: asString(args.blockedReason) ?? null })
    const updated = await issueOf(actor, args.ref)
    return { ref: updated.ref, status: updated.status, assignee: updated.assignee, priority: updated.priority, title: updated.title }
}

async function commentIssueForKey(actor: Actor, args: Record<string, unknown>) {
    const issue = await issueOf(actor, args.ref)
    await assertIssueAccess(issue.id, 'use', actor)
    const comment = await addIssueComment(scopeOf(actor), authorOf(actor), issue.id, { body: requireString(args.body, 'body') })
    return { ref: issue.ref, commentId: comment.id }
}

export async function dispatchWorkAccountTool(actor: Actor, name: string, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
        case 'list_projects': {
            const projects = await listProjects(scopeOf(actor), actor, { includeArchived: args.includeArchived === true })
            return { projects: projects.map(project => ({ key: project.key, name: project.name, description: project.description, status: project.status, visibility: project.visibility, lead: project.lead, targetDate: project.targetDate, archivedAt: project.archivedAt, issueCounts: project.issueCounts, access: project.access })) }
        }
        case 'list_issues':
            return listIssuesForKey(actor, args)
        case 'get_issue':
            return getIssueForKey(actor, args)
        case 'create_issue':
            return createIssueForKey(actor, args)
        case 'update_issue':
            return updateIssueForKey(actor, args)
        case 'comment_issue':
            return commentIssueForKey(actor, args)
        default:
            throw new Error(`Unknown tool: ${name}`)
    }
}
