import { z } from 'zod'

// The work layer shared by people and agents: projects and their issues, teams, goals, channels and
// the assistant chat. The enums mirror the Postgres ones of the 20261110* migrations; a refusal a
// schema raises is named by an `errors` code, which the server action sends back translated.

export const PROJECT_STATUSES = ['planned', 'active', 'paused', 'completed', 'archived'] as const
export const projectStatusSchema = z.enum(PROJECT_STATUSES)
export type ProjectStatus = z.infer<typeof projectStatusSchema>

// Who sees a project: every member of the workspace scoped to `all`, or only the people named on it.
export const PROJECT_VISIBILITIES = ['workspace', 'restricted'] as const
export const projectVisibilitySchema = z.enum(PROJECT_VISIBILITIES)
export type ProjectVisibility = z.infer<typeof projectVisibilitySchema>

// `use` works on the issues, `manage` changes the project itself and who is on it.
export const PROJECT_ACCESS_LEVELS = ['use', 'manage'] as const
export const projectAccessSchema = z.enum(PROJECT_ACCESS_LEVELS)
export type ProjectAccess = z.infer<typeof projectAccessSchema>

export const ISSUE_STATUSES = ['backlog', 'todo', 'in_progress', 'in_review', 'done', 'blocked', 'cancelled'] as const
export const issueStatusSchema = z.enum(ISSUE_STATUSES)
export type IssueStatus = z.infer<typeof issueStatusSchema>

export const ISSUE_PRIORITIES = ['none', 'low', 'medium', 'high', 'urgent'] as const
export const issuePrioritySchema = z.enum(ISSUE_PRIORITIES)
export type IssuePriority = z.infer<typeof issuePrioritySchema>

export const GOAL_STATUSES = ['planned', 'active', 'achieved', 'cancelled'] as const
export const goalStatusSchema = z.enum(GOAL_STATUSES)
export type GoalStatus = z.infer<typeof goalStatusSchema>

export const TEAM_MEMBER_ROLES = ['lead', 'member'] as const
export const teamMemberRoleSchema = z.enum(TEAM_MEMBER_ROLES)
export type TeamMemberRole = z.infer<typeof teamMemberRoleSchema>

export const CHANNEL_KINDS = ['public', 'private', 'dm'] as const
export const channelKindSchema = z.enum(CHANNEL_KINDS)
export type ChannelKind = z.infer<typeof channelKindSchema>

// The edges of the issue workflow. Staying in the same status is not a transition: a reorder inside
// a column never goes through this matrix.
export const ISSUE_TRANSITIONS: Readonly<Record<IssueStatus, readonly IssueStatus[]>> = {
    backlog: ['todo', 'cancelled'],
    todo: ['in_progress', 'backlog', 'blocked', 'cancelled'],
    in_progress: ['in_review', 'done', 'blocked', 'todo', 'cancelled'],
    in_review: ['done', 'in_progress', 'cancelled'],
    blocked: ['todo', 'in_progress', 'cancelled'],
    done: ['todo'],
    cancelled: ['backlog'],
}

export function canTransitionIssue(from: IssueStatus, to: IssueStatus): boolean {
    return ISSUE_TRANSITIONS[from].includes(to)
}

// An issue that left the workflow: it counts as finished on a board and in "my work".
export const ISSUE_CLOSED_STATUSES = ['done', 'cancelled'] as const satisfies readonly IssueStatus[]

export function isIssueClosed(status: IssueStatus): boolean {
    return (ISSUE_CLOSED_STATUSES as readonly IssueStatus[]).includes(status)
}

// The statuses from which an agent run may take an issue to work on it.
export const ISSUE_CHECKOUT_STATUSES = ['todo', 'in_progress', 'blocked'] as const satisfies readonly IssueStatus[]

// What a coworker may move one of its own issues to with `work_update_status`. Backlog is a person's
// call: an agent hands an issue back with `todo` or explains with `blocked`.
export const AGENT_ISSUE_STATUSES = ['todo', 'in_progress', 'in_review', 'done', 'blocked', 'cancelled'] as const satisfies readonly IssueStatus[]
export type AgentIssueStatus = (typeof AGENT_ISSUE_STATUSES)[number]

// The `work` tool family of a coworker, answered by the hub (`work-hub.service.ts`).
export const WORK_TOOL_NAMES = ['work_inbox', 'work_get_issue', 'work_checkout', 'work_update_status', 'work_comment', 'work_create_issue', 'work_list_issues', 'work_list_projects'] as const
export type WorkToolName = (typeof WORK_TOOL_NAMES)[number]

// Why the hub wakes a coworker on an issue. `heartbeat` is the engine's own sweep of assigned work.
export const ISSUE_WAKE_REASONS = ['assigned', 'ready', 'reopened', 'comment', 'heartbeat'] as const
export const issueWakeReasonSchema = z.enum(ISSUE_WAKE_REASONS)
export type IssueWakeReason = z.infer<typeof issueWakeReasonSchema>

export const issueRunRequestSchema = z.object({
    ref: z.string().min(1).max(20),
    title: z.string().min(1).max(300),
    reason: issueWakeReasonSchema,
    note: z.string().max(2000).optional(),
})
export type IssueRunRequest = z.infer<typeof issueRunRequestSchema>

export const PROJECT_KEY_PATTERN = /^[A-Z][A-Z0-9]{1,5}$/
export const projectKeySchema = z.string().trim().toUpperCase().regex(PROJECT_KEY_PATTERN, { message: 'projectKeyInvalid' })

export function formatIssueRef(projectKey: string, number: number): string {
    return `${projectKey}-${number}`
}

// `eng-12` reads as ENG-12: a reference is typed by people as often as it is pasted.
export function parseIssueRef(ref: string): { projectKey: string; number: number } | null {
    const match = /^([A-Za-z][A-Za-z0-9]{1,5})-([1-9][0-9]{0,8})$/.exec(ref.trim())
    if (!match) return null
    return { projectKey: match[1].toUpperCase(), number: Number(match[2]) }
}

// A person or an agent of the workspace: an assignee, a team member, a mention.
export const workMemberRefSchema = z.discriminatedUnion('kind', [z.object({ kind: z.literal('user'), userId: z.string().min(1) }), z.object({ kind: z.literal('agent'), agentId: z.string().min(1) })])
export type WorkMemberRef = z.infer<typeof workMemberRefSchema>

// Who did something. `system` is a change nobody made by hand (a schedule, a migration), and what
// a deleted author's comments and messages read as.
export const workAuthorSchema = z.discriminatedUnion('kind', [z.object({ kind: z.literal('user'), userId: z.string().min(1) }), z.object({ kind: z.literal('agent'), agentId: z.string().min(1) }), z.object({ kind: z.literal('system') })])
export type WorkAuthor = z.infer<typeof workAuthorSchema>

export const SYSTEM_AUTHOR: WorkAuthor = { kind: 'system' }

export const ACTIVITY_ENTITY_TYPES = ['project', 'issue', 'issue_comment', 'goal', 'team', 'channel', 'agent', 'assistant_chat'] as const
export const activityEntityTypeSchema = z.enum(ACTIVITY_ENTITY_TYPES)
export type ActivityEntityType = z.infer<typeof activityEntityTypeSchema>

export const ACTIVITY_ACTIONS = [
    'project.created',
    'project.updated',
    'project.archived',
    'project.restored',
    'project.member_granted',
    'project.member_revoked',
    'issue.created',
    'issue.updated',
    'issue.status_changed',
    'issue.assigned',
    'issue.unassigned',
    'issue.commented',
    'issue.comment_edited',
    'issue.checked_out',
    'issue.released',
    'goal.created',
    'goal.updated',
    'goal.status_changed',
    'goal.deleted',
    'team.created',
    'team.updated',
    'team.deleted',
    'team.member_added',
    'team.member_removed',
    'team.member_role_changed',
    'channel.created',
    'channel.updated',
    'channel.archived',
    'agent.reporting_changed',
] as const
export const activityActionSchema = z.enum(ACTIVITY_ACTIONS)
export type ActivityAction = z.infer<typeof activityActionSchema>

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const nullableText = (max: number) => z.string().max(max).nullable()

export const issueCountsSchema = z.partialRecord(issueStatusSchema, z.number().int().nonnegative())
export type IssueCounts = Partial<Record<IssueStatus, number>>

export const projectSummarySchema = z.object({
    id: z.string(),
    key: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    status: projectStatusSchema,
    visibility: projectVisibilitySchema,
    teamId: z.string().nullable(),
    goalId: z.string().nullable(),
    lead: workMemberRefSchema.nullable(),
    targetDate: isoDate.nullable(),
    archivedAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
    issueCounts: issueCountsSchema,
    // The caller's level on it. A project the caller cannot see is never sent.
    access: projectAccessSchema,
})
export type ProjectSummary = z.infer<typeof projectSummarySchema>

export const projectMemberSchema = z.object({
    userId: z.string(),
    access: projectAccessSchema,
    grantedBy: z.string().nullable(),
    createdAt: z.string(),
})
export type ProjectMember = z.infer<typeof projectMemberSchema>

export const projectDetailSchema = projectSummarySchema.extend({
    instructions: z.string().nullable(),
    monthlyBudgetMicros: z.number().nullable(),
    createdBy: z.string().nullable(),
    members: z.array(projectMemberSchema),
})
export type ProjectDetail = z.infer<typeof projectDetailSchema>

export const issueSummarySchema = z.object({
    id: z.string(),
    projectId: z.string(),
    number: z.number().int(),
    ref: z.string(),
    title: z.string(),
    status: issueStatusSchema,
    priority: issuePrioritySchema,
    assignee: workMemberRefSchema.nullable(),
    parentIssueId: z.string().nullable(),
    goalId: z.string().nullable(),
    dueDate: isoDate.nullable(),
    position: z.number(),
    // Held by an agent run while it works on the issue.
    checkoutRunId: z.string().nullable(),
    checkedOutAt: z.string().nullable(),
    startedAt: z.string().nullable(),
    completedAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
})
export type IssueSummary = z.infer<typeof issueSummarySchema>

export const issueDetailSchema = issueSummarySchema.extend({
    description: z.string().nullable(),
    blockedReason: z.string().nullable(),
    createdBy: workAuthorSchema,
    // The conversation in which the assigned agent works on it.
    sessionId: z.string().nullable(),
    subIssues: z.array(issueSummarySchema),
    // Its project is restricted: whoever may use a coworker it is assigned to can see the work.
    projectRestricted: z.boolean().optional(),
})
export type IssueDetail = z.infer<typeof issueDetailSchema>

export const issueCommentSchema = z.object({
    id: z.string(),
    issueId: z.string(),
    author: workAuthorSchema,
    body: z.string(),
    editedAt: z.string().nullable(),
    createdAt: z.string(),
})
export type IssueComment = z.infer<typeof issueCommentSchema>

export const goalSchema = z.object({
    id: z.string(),
    parentGoalId: z.string().nullable(),
    teamId: z.string().nullable(),
    title: z.string(),
    description: z.string().nullable(),
    status: goalStatusSchema,
    ownerUserId: z.string().nullable(),
    targetDate: isoDate.nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
})
export type Goal = z.infer<typeof goalSchema>

export const teamMemberSchema = z.object({
    id: z.string(),
    member: workMemberRefSchema,
    role: teamMemberRoleSchema,
})
export type TeamMember = z.infer<typeof teamMemberSchema>

export const teamSchema = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    color: z.string().nullable(),
    members: z.array(teamMemberSchema),
    createdAt: z.string(),
    updatedAt: z.string(),
})
export type Team = z.infer<typeof teamSchema>

export const channelSchema = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    kind: channelKindSchema,
    projectId: z.string().nullable(),
    teamId: z.string().nullable(),
    createdBy: z.string().nullable(),
    archivedAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
})
export type Channel = z.infer<typeof channelSchema>

export const channelMessageSchema = z.object({
    id: z.string(),
    channelId: z.string(),
    author: workAuthorSchema,
    body: z.string(),
    parentMessageId: z.string().nullable(),
    mentions: z.array(workMemberRefSchema),
    editedAt: z.string().nullable(),
    deletedAt: z.string().nullable(),
    createdAt: z.string(),
})
export type ChannelMessage = z.infer<typeof channelMessageSchema>

export const activityEventSchema = z.object({
    id: z.string(),
    projectId: z.string().nullable(),
    issueId: z.string().nullable(),
    entityType: activityEntityTypeSchema,
    entityId: z.string(),
    action: activityActionSchema,
    actor: workAuthorSchema,
    metadata: z.record(z.string(), z.unknown()),
    createdAt: z.string(),
})
export type ActivityEvent = z.infer<typeof activityEventSchema>

export const assistantChatSchema = z.object({
    id: z.string(),
    userId: z.string(),
    projectId: z.string().nullable(),
    title: z.string(),
    engineSessionId: z.string().nullable(),
    model: z.string().nullable(),
    shared: z.boolean(),
    lastMessageAt: z.string().nullable(),
    archivedAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
})
export type AssistantChat = z.infer<typeof assistantChatSchema>

const projectNameSchema = z.string().trim().min(1, { message: 'nameRequired' }).max(120, { message: 'textTooLong' })
const issueTitleSchema = z.string().trim().min(1, { message: 'titleRequired' }).max(300, { message: 'textTooLong' })
const budgetMicrosSchema = z.number().int().nonnegative().nullable()

const projectFieldsSchema = z.object({
    name: projectNameSchema,
    description: nullableText(20_000).optional(),
    instructions: nullableText(50_000).optional(),
    status: projectStatusSchema.optional(),
    visibility: projectVisibilitySchema.optional(),
    teamId: z.string().nullable().optional(),
    goalId: z.string().nullable().optional(),
    lead: workMemberRefSchema.nullable().optional(),
    monthlyBudgetMicros: budgetMicrosSchema.optional(),
    targetDate: isoDate.nullable().optional(),
})

export const createProjectInputSchema = projectFieldsSchema.extend({ key: projectKeySchema })
export type CreateProjectInput = z.input<typeof createProjectInputSchema>

// The key is left out on purpose: every reference already handed out (ENG-12) would stop resolving.
export const updateProjectInputSchema = projectFieldsSchema.partial()
export type UpdateProjectInput = z.input<typeof updateProjectInputSchema>

export const createIssueInputSchema = z.object({
    projectId: z.string().min(1),
    title: issueTitleSchema,
    description: nullableText(100_000).optional(),
    status: issueStatusSchema.optional(),
    priority: issuePrioritySchema.optional(),
    assignee: workMemberRefSchema.nullable().optional(),
    parentIssueId: z.string().nullable().optional(),
    goalId: z.string().nullable().optional(),
    dueDate: isoDate.nullable().optional(),
})
export type CreateIssueInput = z.input<typeof createIssueInputSchema>

// Status and assignee have their own verbs (transition, move, assign): they carry rules of their own.
export const updateIssueInputSchema = z.object({
    title: issueTitleSchema.optional(),
    description: nullableText(100_000).optional(),
    priority: issuePrioritySchema.optional(),
    parentIssueId: z.string().nullable().optional(),
    goalId: z.string().nullable().optional(),
    dueDate: isoDate.nullable().optional(),
    blockedReason: nullableText(2000).optional(),
})
export type UpdateIssueInput = z.input<typeof updateIssueInputSchema>

export const transitionIssueInputSchema = z.object({
    status: issueStatusSchema,
    blockedReason: nullableText(2000).optional(),
})
export type TransitionIssueInput = z.input<typeof transitionIssueInputSchema>

// A drop names its place by the card it lands above (`beforeIssueId`, null for the end of the
// column) and the server works out the position from the whole column, cards the board has not loaded
// included. A bare `position` is kept for callers that computed one.
export const moveIssueInputSchema = z.object({
    status: issueStatusSchema,
    position: z.number().finite().optional(),
    beforeIssueId: z.string().min(1).nullable().optional(),
})
export type MoveIssueInput = z.input<typeof moveIssueInputSchema>

export const assignIssueInputSchema = z.object({ assignee: workMemberRefSchema.nullable() })
export type AssignIssueInput = z.input<typeof assignIssueInputSchema>

export const issueListFiltersSchema = z.object({
    projectId: z.string().optional(),
    status: z.array(issueStatusSchema).optional(),
    assignee: z.union([workMemberRefSchema, z.literal('unassigned')]).optional(),
    // Only the issues held by a person, or by a coworker, whoever it is.
    assigneeKind: z.enum(['user', 'agent']).optional(),
    createdBy: workMemberRefSchema.optional(),
    // null lists the top-level issues only.
    parentIssueId: z.string().nullable().optional(),
    text: z.string().trim().max(200).optional(),
    // `position` is the order of a board column, `updated` the order of "my work" and an inbox.
    sort: z.enum(['position', 'updated', 'created']).optional(),
    limit: z.number().int().min(1).max(500).optional(),
    offset: z.number().int().nonnegative().optional(),
})
export type IssueListFilters = z.input<typeof issueListFiltersSchema>

const commentBodySchema = z.string().trim().min(1, { message: 'commentRequired' }).max(50_000, { message: 'textTooLong' })

export const createIssueCommentInputSchema = z.object({ body: commentBodySchema })
export type CreateIssueCommentInput = z.input<typeof createIssueCommentInputSchema>

export const editIssueCommentInputSchema = z.object({ body: commentBodySchema })
export type EditIssueCommentInput = z.input<typeof editIssueCommentInputSchema>

export const grantProjectMemberInputSchema = z.object({ userId: z.string().min(1), access: projectAccessSchema })
export type GrantProjectMemberInput = z.input<typeof grantProjectMemberInputSchema>

export const createGoalInputSchema = z.object({
    title: z.string().trim().min(1, { message: 'titleRequired' }).max(200, { message: 'textTooLong' }),
    description: nullableText(20_000).optional(),
    status: goalStatusSchema.optional(),
    parentGoalId: z.string().nullable().optional(),
    teamId: z.string().nullable().optional(),
    ownerUserId: z.string().nullable().optional(),
    targetDate: isoDate.nullable().optional(),
})
export type CreateGoalInput = z.input<typeof createGoalInputSchema>

export const updateGoalInputSchema = createGoalInputSchema.partial()
export type UpdateGoalInput = z.input<typeof updateGoalInputSchema>

export const createTeamInputSchema = z.object({
    name: z.string().trim().min(1, { message: 'nameRequired' }).max(80, { message: 'textTooLong' }),
    description: nullableText(2000).optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
})
export type CreateTeamInput = z.input<typeof createTeamInputSchema>

export const updateTeamInputSchema = createTeamInputSchema.partial()
export type UpdateTeamInput = z.input<typeof updateTeamInputSchema>

export const teamMemberInputSchema = z.object({ member: workMemberRefSchema, role: teamMemberRoleSchema.optional() })
export type TeamMemberInput = z.input<typeof teamMemberInputSchema>

export const createChannelInputSchema = z.object({
    name: z.string().trim().max(80, { message: 'textTooLong' }),
    description: nullableText(2000).optional(),
    kind: channelKindSchema,
    projectId: z.string().nullable().optional(),
    teamId: z.string().nullable().optional(),
    members: z.array(workMemberRefSchema).max(500).optional(),
})
export type CreateChannelInput = z.input<typeof createChannelInputSchema>

export const updateChannelInputSchema = createChannelInputSchema.pick({ name: true, description: true, projectId: true, teamId: true }).partial()
export type UpdateChannelInput = z.input<typeof updateChannelInputSchema>

export const postChannelMessageInputSchema = z.object({
    body: z.string().trim().min(1, { message: 'messageRequired' }).max(40_000, { message: 'textTooLong' }),
    parentMessageId: z.string().nullable().optional(),
    mentions: z.array(workMemberRefSchema).max(100).optional(),
})
export type PostChannelMessageInput = z.input<typeof postChannelMessageInputSchema>

export const createAssistantChatInputSchema = z.object({
    projectId: z.string().nullable().optional(),
    title: z.string().trim().max(200).optional(),
    model: z.string().max(200).nullable().optional(),
})
export type CreateAssistantChatInput = z.input<typeof createAssistantChatInputSchema>

export const updateAssistantChatInputSchema = z.object({
    title: z.string().trim().min(1, { message: 'titleRequired' }).max(200, { message: 'textTooLong' }).optional(),
    projectId: z.string().nullable().optional(),
    model: z.string().max(200).nullable().optional(),
    shared: z.boolean().optional(),
})
export type UpdateAssistantChatInput = z.input<typeof updateAssistantChatInputSchema>
