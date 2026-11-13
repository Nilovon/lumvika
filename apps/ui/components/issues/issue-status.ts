import { ISSUE_PRIORITIES, ISSUE_TRANSITIONS, type IssuePriority, type IssueStatus, type ProjectStatus } from '@lumvika/contracts'
import type { BadgeTone } from '@lumvika/ui/primitives'

export const ISSUE_STATUS_TONES: Record<IssueStatus, BadgeTone> = {
    backlog: 'neutral',
    todo: 'white',
    in_progress: 'cyan',
    in_review: 'orange',
    blocked: 'red',
    done: 'green',
    cancelled: 'neutral',
}

// The order of a board, left to right: the workflow, then the two ways out of it.
export const BOARD_STATUSES = ['backlog', 'todo', 'in_progress', 'in_review', 'blocked', 'done', 'cancelled'] as const satisfies readonly IssueStatus[]

export const PROJECT_STATUS_TONES: Record<ProjectStatus, BadgeTone> = {
    planned: 'neutral',
    active: 'green',
    paused: 'yellow',
    completed: 'cyan',
    archived: 'neutral',
}

// Highest first, the order a list sorted by priority reads in.
export const PRIORITIES_BY_WEIGHT = [...ISSUE_PRIORITIES].reverse() as IssuePriority[]

export function priorityWeight(priority: IssuePriority): number {
    return ISSUE_PRIORITIES.indexOf(priority)
}

export function statusIndex(status: IssueStatus): number {
    return BOARD_STATUSES.indexOf(status)
}

// The statuses an issue may move to from where it is, in board order.
export function nextStatuses(from: IssueStatus): IssueStatus[] {
    return BOARD_STATUSES.filter(status => ISSUE_TRANSITIONS[from].includes(status))
}
