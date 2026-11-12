import {
    formatIssueRef,
    workMemberRefSchema,
    type ActivityAction,
    type ActivityEntityType,
    type ActivityEvent,
    type AssistantChat,
    type Channel,
    type ChannelMessage,
    type Goal,
    type IssueComment,
    type IssueCounts,
    type IssueDetail,
    type IssueSummary,
    type ProjectAccess,
    type ProjectDetail,
    type ProjectMember,
    type ProjectSummary,
    type Team,
    type TeamMemberRole,
    type WorkMemberRef,
} from '@lumvika/contracts'

import { toAccessLevel, toVisibility } from '@/app/api/_auth/access'
import type {
    ActivityEventRow,
    AssistantChatRow,
    ChannelMessageRow,
    ChannelRow,
    GoalRow,
    IssueCommentRow,
    IssueRow,
    IssueSummaryRow,
    ProjectMemberRow,
    ProjectRow,
    TeamMemberRow,
    TeamRow,
} from '@/app/api/_services/work/columns'
import { authorOf, memberRefOf } from '@/app/api/_services/work/refs'

// Database rows to the DTOs of `@lumvika/contracts/work`, the one place their shapes meet.

export function toProjectSummary(row: ProjectRow, issueCounts: IssueCounts, access: ProjectAccess): ProjectSummary {
    return {
        id: row.id,
        key: row.key,
        name: row.name,
        description: row.description,
        status: row.status,
        visibility: toVisibility(row.visibility),
        teamId: row.team_id,
        goalId: row.goal_id,
        lead: memberRefOf(row.lead_user_id, row.lead_agent_id),
        targetDate: row.target_date,
        archivedAt: row.archived_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        issueCounts,
        access,
    }
}

export function toProjectMember(row: ProjectMemberRow): ProjectMember {
    return { userId: row.user_id, access: toAccessLevel(row.access) ?? 'use', grantedBy: row.granted_by, createdAt: row.created_at }
}

export function toProjectDetail(row: ProjectRow, issueCounts: IssueCounts, access: ProjectAccess, members: ProjectMemberRow[]): ProjectDetail {
    return {
        ...toProjectSummary(row, issueCounts, access),
        instructions: row.instructions,
        monthlyBudgetMicros: row.monthly_budget_micros,
        createdBy: row.created_by,
        members: members.map(toProjectMember),
    }
}

export function toIssueSummary(row: IssueSummaryRow, projectKey: string): IssueSummary {
    return {
        id: row.id,
        projectId: row.project_id,
        number: row.number,
        ref: formatIssueRef(projectKey, row.number),
        title: row.title,
        status: row.status,
        priority: row.priority,
        assignee: memberRefOf(row.assignee_user_id, row.assignee_agent_id),
        parentIssueId: row.parent_issue_id,
        goalId: row.goal_id,
        dueDate: row.due_date,
        position: row.position,
        checkoutRunId: row.checkout_run_id,
        checkedOutAt: row.checked_out_at,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    }
}

export function toIssueDetail(row: IssueRow, projectKey: string, subIssues: IssueSummary[]): IssueDetail {
    return {
        ...toIssueSummary(row, projectKey),
        description: row.description,
        blockedReason: row.blocked_reason,
        createdBy: authorOf(row.created_by_user_id, row.created_by_agent_id),
        sessionId: row.session_id,
        subIssues,
    }
}

export function toIssueComment(row: IssueCommentRow): IssueComment {
    return { id: row.id, issueId: row.issue_id, author: authorOf(row.author_user_id, row.author_agent_id), body: row.body, editedAt: row.edited_at, createdAt: row.created_at }
}

export function toActivityEvent(row: ActivityEventRow): ActivityEvent {
    return {
        id: row.id,
        projectId: row.project_id,
        issueId: row.issue_id,
        entityType: row.entity_type as ActivityEntityType,
        entityId: row.entity_id,
        action: row.action as ActivityAction,
        actor: authorOf(row.actor_user_id, row.actor_agent_id),
        metadata: row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? row.metadata : {},
        createdAt: row.created_at,
    }
}

export function toGoal(row: GoalRow): Goal {
    return {
        id: row.id,
        parentGoalId: row.parent_goal_id,
        teamId: row.team_id,
        title: row.title,
        description: row.description,
        status: row.status,
        ownerUserId: row.owner_user_id,
        targetDate: row.target_date,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    }
}

export function toTeam(row: TeamRow, members: TeamMemberRow[]): Team {
    return {
        id: row.id,
        name: row.name,
        description: row.description,
        color: row.color,
        members: members.flatMap(member => {
            const ref = memberRefOf(member.user_id, member.agent_id)
            return ref ? [{ id: member.id, member: ref, role: member.role as TeamMemberRole }] : []
        }),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    }
}

export function toChannel(row: ChannelRow): Channel {
    return {
        id: row.id,
        name: row.name,
        description: row.description,
        kind: row.kind,
        projectId: row.project_id,
        teamId: row.team_id,
        createdBy: row.created_by,
        archivedAt: row.archived_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    }
}

// Mentions are stored as written; one that no longer parses is dropped rather than failing the message.
export function mentionsOf(value: unknown): WorkMemberRef[] {
    if (!Array.isArray(value)) return []
    return value.flatMap(entry => {
        const parsed = workMemberRefSchema.safeParse(entry)
        return parsed.success ? [parsed.data] : []
    })
}

export function toChannelMessage(row: ChannelMessageRow): ChannelMessage {
    return {
        id: row.id,
        channelId: row.channel_id,
        author: authorOf(row.author_user_id, row.author_agent_id),
        body: row.deleted_at ? '' : row.body,
        parentMessageId: row.parent_message_id,
        mentions: row.deleted_at ? [] : mentionsOf(row.mentions),
        editedAt: row.edited_at,
        deletedAt: row.deleted_at,
        createdAt: row.created_at,
    }
}

export function toAssistantChat(row: AssistantChatRow): AssistantChat {
    return {
        id: row.id,
        userId: row.user_id,
        projectId: row.project_id,
        title: row.title,
        engineSessionId: row.engine_session_id,
        model: row.model,
        shared: row.shared,
        lastMessageAt: row.last_message_at,
        archivedAt: row.archived_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    }
}
