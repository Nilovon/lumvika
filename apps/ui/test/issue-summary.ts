import type { IssueSummary } from '@lumvika/contracts'

// An issue as the services hand it to a screen, for the tests of what screens do with it.
export function issueSummary(overrides: Partial<IssueSummary> = {}): IssueSummary {
    return {
        id: 'issue-1',
        projectId: 'project-1',
        number: 1,
        ref: 'ENG-1',
        title: 'Write the launch post',
        status: 'todo',
        priority: 'none',
        assignee: null,
        parentIssueId: null,
        goalId: null,
        dueDate: null,
        position: 1024,
        checkoutRunId: null,
        checkedOutAt: null,
        startedAt: null,
        completedAt: null,
        createdAt: '2026-11-01T00:00:00.000Z',
        updatedAt: '2026-11-01T00:00:00.000Z',
        ...overrides,
    }
}
