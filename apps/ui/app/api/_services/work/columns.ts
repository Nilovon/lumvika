import type { TableRow } from '@/lib/db'

// The columns each work table is read with, so a feature reads the same shape the mappers expect.

export const PROJECT_COLUMNS = [
    'id',
    'workspace_id',
    'key',
    'name',
    'description',
    'instructions',
    'status',
    'visibility',
    'team_id',
    'goal_id',
    'lead_user_id',
    'lead_agent_id',
    'monthly_budget_micros',
    'target_date',
    'created_by',
    'archived_at',
    'created_at',
    'updated_at',
] as const
export type ProjectRow = Pick<TableRow<'projects'>, (typeof PROJECT_COLUMNS)[number]>

export const PROJECT_MEMBER_COLUMNS = ['project_id', 'user_id', 'workspace_id', 'access', 'granted_by', 'created_at'] as const
export type ProjectMemberRow = Pick<TableRow<'project_members'>, (typeof PROJECT_MEMBER_COLUMNS)[number]>

export const ISSUE_COLUMNS = [
    'id',
    'workspace_id',
    'project_id',
    'number',
    'title',
    'description',
    'status',
    'priority',
    'assignee_user_id',
    'assignee_agent_id',
    'created_by_user_id',
    'created_by_agent_id',
    'parent_issue_id',
    'goal_id',
    'due_date',
    'position',
    'blocked_reason',
    'checkout_run_id',
    'checked_out_at',
    'session_id',
    'started_at',
    'completed_at',
    'created_at',
    'updated_at',
] as const
export type IssueRow = Pick<TableRow<'issues'>, (typeof ISSUE_COLUMNS)[number]>

// What a board card and a list row need: no description, which can be long.
export const ISSUE_SUMMARY_COLUMNS = [
    'id',
    'workspace_id',
    'project_id',
    'number',
    'title',
    'status',
    'priority',
    'assignee_user_id',
    'assignee_agent_id',
    'parent_issue_id',
    'goal_id',
    'due_date',
    'position',
    'checkout_run_id',
    'checked_out_at',
    'started_at',
    'completed_at',
    'created_at',
    'updated_at',
] as const
export type IssueSummaryRow = Pick<TableRow<'issues'>, (typeof ISSUE_SUMMARY_COLUMNS)[number]>

export const ISSUE_COMMENT_COLUMNS = ['id', 'workspace_id', 'issue_id', 'author_user_id', 'author_agent_id', 'body', 'edited_at', 'created_at', 'updated_at'] as const
export type IssueCommentRow = Pick<TableRow<'issue_comments'>, (typeof ISSUE_COMMENT_COLUMNS)[number]>

export const ACTIVITY_EVENT_COLUMNS = ['id', 'workspace_id', 'project_id', 'issue_id', 'entity_type', 'entity_id', 'action', 'actor_user_id', 'actor_agent_id', 'metadata', 'created_at'] as const
export type ActivityEventRow = Pick<TableRow<'activity_events'>, (typeof ACTIVITY_EVENT_COLUMNS)[number]>

export const TEAM_COLUMNS = ['id', 'workspace_id', 'name', 'description', 'color', 'created_at', 'updated_at'] as const
export type TeamRow = Pick<TableRow<'teams'>, (typeof TEAM_COLUMNS)[number]>

export const TEAM_MEMBER_COLUMNS = ['id', 'team_id', 'workspace_id', 'user_id', 'agent_id', 'role', 'created_at', 'updated_at'] as const
export type TeamMemberRow = Pick<TableRow<'team_members'>, (typeof TEAM_MEMBER_COLUMNS)[number]>

export const GOAL_COLUMNS = ['id', 'workspace_id', 'parent_goal_id', 'team_id', 'title', 'description', 'status', 'owner_user_id', 'target_date', 'created_at', 'updated_at'] as const
export type GoalRow = Pick<TableRow<'goals'>, (typeof GOAL_COLUMNS)[number]>

export const CHANNEL_COLUMNS = ['id', 'workspace_id', 'name', 'description', 'kind', 'project_id', 'team_id', 'created_by', 'archived_at', 'created_at', 'updated_at'] as const
export type ChannelRow = Pick<TableRow<'channels'>, (typeof CHANNEL_COLUMNS)[number]>

export const CHANNEL_MEMBER_COLUMNS = ['id', 'channel_id', 'workspace_id', 'user_id', 'agent_id', 'last_read_at', 'created_at', 'updated_at'] as const
export type ChannelMemberRow = Pick<TableRow<'channel_members'>, (typeof CHANNEL_MEMBER_COLUMNS)[number]>

export const CHANNEL_MESSAGE_COLUMNS = ['id', 'channel_id', 'workspace_id', 'author_user_id', 'author_agent_id', 'body', 'parent_message_id', 'mentions', 'edited_at', 'deleted_at', 'created_at', 'updated_at'] as const
export type ChannelMessageRow = Pick<TableRow<'channel_messages'>, (typeof CHANNEL_MESSAGE_COLUMNS)[number]>

export const ASSISTANT_CHAT_COLUMNS = ['id', 'workspace_id', 'user_id', 'project_id', 'title', 'engine_session_id', 'model', 'shared', 'last_message_at', 'archived_at', 'created_at', 'updated_at'] as const
export type AssistantChatRow = Pick<TableRow<'assistant_chats'>, (typeof ASSISTANT_CHAT_COLUMNS)[number]>
