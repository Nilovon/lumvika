import type { Row } from '@/test/work-fake'

export const WORKSPACE = 7

// The rows of the work tables as the database holds them, for the services' tests.
export function issueRow(overrides: Row = {}): Row {
    return {
        id: 'issue-1',
        workspace_id: WORKSPACE,
        project_id: 'project-1',
        number: 1,
        title: 'Write the launch post',
        description: null,
        status: 'todo',
        priority: 'none',
        assignee_user_id: null,
        assignee_agent_id: null,
        created_by_user_id: null,
        created_by_agent_id: null,
        parent_issue_id: null,
        goal_id: null,
        due_date: null,
        position: 1024,
        blocked_reason: null,
        checkout_run_id: null,
        checked_out_at: null,
        session_id: null,
        started_at: null,
        completed_at: null,
        created_at: '2026-11-01T00:00:00.000Z',
        updated_at: '2026-11-01T00:00:00.000Z',
        ...overrides,
    }
}

export function projectRow(overrides: Row = {}): Row {
    return {
        id: 'project-1',
        workspace_id: WORKSPACE,
        key: 'ENG',
        name: 'Engineering',
        status: 'active',
        visibility: 'workspace',
        lead_user_id: null,
        lead_agent_id: null,
        goal_id: null,
        archived_at: null,
        created_at: '2026-10-01T00:00:00.000Z',
        updated_at: '2026-10-01T00:00:00.000Z',
        ...overrides,
    }
}
