import { AGENT_ISSUE_STATUSES, ISSUE_PRIORITIES, ISSUE_STATUSES } from '@lumvika/contracts'
import { tool, type ToolSet } from 'ai'
import { z } from 'zod'
import type { RunContext } from '../../runtime/context.js'
import { callHub } from '../../runtime/hub.js'

const ref = z.string().describe('Issue reference, e.g. ENG-12.')

// The run and its conversation travel with every call that can take or let go of an issue: the hub
// holds the checkout in the run's name and links the issue to the conversation it is worked in.
export function workTools(ctx: RunContext): ToolSet {
    const call = (name: string, args: Record<string, unknown>) => callHub(ctx.agent, name, args)
    const run = () => ({ runId: ctx.runId ?? null, sessionId: ctx.sessionId ?? null })
    return {
        work_inbox: tool({
            description:
                'Your open assigned issues in working order: in_progress, then todo, then blocked, by priority and due date, with project, parent, due date and whether another run holds one. Call it when woken for your work or asked what is on your plate. One issue at a time: work_get_issue, work_checkout, then work. Take a blocked one only if you can unblock it.',
            inputSchema: z.object({}),
            execute: () => call('work_inbox', run()),
        }),
        work_get_issue: tool({
            description:
                'One issue in full: description, project instructions (follow them), goal, parent and sub-issues, comments, who created and assigned it. Read it before you start.',
            inputSchema: z.object({ ref }),
            execute: args => call('work_get_issue', args),
        }),
        work_checkout: tool({
            description:
                'Take one of your issues (todo, in_progress or blocked) before working on it: it moves to in_progress, held by this run until it ends. If another run holds it, do not retry and do not work on it.',
            inputSchema: z.object({ ref }),
            execute: args => call('work_checkout', { ...args, ...run() }),
        }),
        work_update_status: tool({
            description:
                'Move one of your issues, optionally with a comment on what you did. done: finished work a coworker created. in_review: any other finished work. blocked: you cannot go on; blockedReason names who must do what ("Anna must share the Stripe key"). todo: hand it back. cancelled: a coworker-created issue no longer needed.',
            inputSchema: z.object({
                ref,
                status: z.enum(AGENT_ISSUE_STATUSES),
                blockedReason: z.string().max(2000).optional().describe('Required with blocked.'),
                comment: z.string().max(50_000).optional(),
            }),
            execute: args => call('work_update_status', { ...args, ...run() }),
        }),
        work_comment: tool({
            description: 'Comment on an issue: progress, a question to whoever asked, the result and where to find it. Markdown, self-contained.',
            inputSchema: z.object({ ref, body: z.string().min(1).max(50_000) }),
            execute: args => call('work_comment', args),
        }),
        work_create_issue: tool({
            description:
                "Create an issue, or a sub-issue with parentRef, to split and delegate work: an assigned coworker is woken to work on it. Assigned issues start in todo, others in backlog. Write a description the assignee can act on alone.",
            inputSchema: z.object({
                title: z.string().min(1).max(300),
                description: z.string().max(100_000).optional(),
                projectKey: z.string().optional().describe('Project key (ENG). Not needed with parentRef.'),
                parentRef: z.string().optional(),
                assignee: z.string().optional().describe("'me', or the handle of a coworker in your Box, your manager or a direct report."),
                priority: z.enum(ISSUE_PRIORITIES).optional(),
                dueDate: z.string().optional().describe('YYYY-MM-DD.'),
                status: z.enum(['backlog', 'todo']).optional(),
            }),
            execute: args => call('work_create_issue', args),
        }),
        work_list_issues: tool({
            description: "Search the issues you can see by project, status, assignee ('me', 'unassigned' or a handle) and text, e.g. to follow work you delegated.",
            inputSchema: z.object({
                projectKey: z.string().optional(),
                status: z.array(z.enum(ISSUE_STATUSES)).optional(),
                assignee: z.string().optional(),
                text: z.string().max(200).optional(),
                limit: z.number().optional().describe('Default 50, max 100.'),
            }),
            execute: args => call('work_list_issues', args),
        }),
        work_list_projects: tool({
            description: 'The projects you can see: key (what refs start with), name, status, lead and issue counts.',
            inputSchema: z.object({}),
            execute: () => call('work_list_projects', {}),
        }),
    }
}
