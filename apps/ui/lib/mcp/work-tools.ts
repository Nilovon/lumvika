import { ISSUE_PRIORITIES, ISSUE_STATUSES } from '@lumvika/contracts'

// The projects half of the account server: the issues people and coworkers work on, reached with the
// access of the key's creator. Same audience and same rule as account-tools.ts: these descriptions are
// the only documentation the calling model gets.

const REF = { type: 'string', description: 'The issue reference, e.g. ENG-12: the project key, a dash and the number.' } as const

const ASSIGNEE = {
    type: ['object', 'null'],
    description: 'A coworker ({"kind": "agent", "agentId": "…"} with an id from list_agents) or a member ({"kind": "user", "userId": "…"}). A coworker assigned an issue in todo, in_progress or blocked is woken to work on it.',
    properties: { kind: { type: 'string', enum: ['agent', 'user'] }, agentId: { type: 'string' }, userId: { type: 'string' } },
    required: ['kind'],
} as const

export const WORK_ACCOUNT_TOOL_DEFS = [
    {
        name: 'list_projects',
        description: 'List the projects of the account you can see: key (what every issue reference starts with), name, description, status, visibility, lead, target date and issue counts by status. Call it first when you need a projectKey.',
        inputSchema: { type: 'object', properties: { includeArchived: { type: 'boolean', description: 'Also list archived projects. Default false.' } } },
    },
    {
        name: 'list_issues',
        description: 'Search the issues of the projects you can see, most recently updated first: by project, status, assignee and words of the title or description. Returns summaries (ref, title, status, priority, assignee, parent, due date); call get_issue for the description and the comments.',
        inputSchema: {
            type: 'object',
            properties: {
                projectKey: { type: 'string' },
                status: { type: 'array', items: { type: 'string', enum: [...ISSUE_STATUSES] } },
                assignee: { type: 'string', description: 'A coworker id from list_agents, a member user id, or "unassigned".' },
                parentRef: { type: 'string', description: 'Only the sub-issues of this issue.' },
                text: { type: 'string' },
                limit: { type: 'number', description: 'Default 50, max 200.' },
            },
        },
    },
    {
        name: 'get_issue',
        description: 'One issue in full by its reference: description, status, priority, assignee, who created it, the blocked reason, its sub-issues and every comment, plus whether a coworker run is working on it right now.',
        inputSchema: { type: 'object', properties: { ref: REF }, required: ['ref'] },
    },
    {
        name: 'create_issue',
        description:
            'Create an issue in a project, or a sub-issue of an existing issue with parentRef (it lands in the parent project). Assign it to a coworker in todo and that coworker is woken to work on it: it checks the issue out, comments, and moves it to in_review when done. Without a status it starts in backlog, where nobody is woken.',
        inputSchema: {
            type: 'object',
            properties: {
                projectKey: { type: 'string', description: 'The project, by key. Not needed with parentRef.' },
                parentRef: { type: 'string' },
                title: { type: 'string' },
                description: { type: 'string', description: 'Markdown. Write what done looks like: the assignee works from it alone.' },
                status: { type: 'string', enum: [...ISSUE_STATUSES], description: 'Default backlog.' },
                priority: { type: 'string', enum: [...ISSUE_PRIORITIES] },
                dueDate: { type: 'string', description: 'YYYY-MM-DD.' },
                assignee: ASSIGNEE,
            },
            required: ['title'],
        },
    },
    {
        name: 'update_issue',
        description:
            'Change an issue: its fields, its status and its assignee, each only if you pass it. A status moves along the board (backlog → todo → in_progress → in_review → done, with blocked and cancelled on the side); a move the board does not allow is refused and says why. Moving to blocked takes a blockedReason. Pass assignee null to unassign.',
        inputSchema: {
            type: 'object',
            properties: {
                ref: REF,
                title: { type: 'string' },
                description: { type: ['string', 'null'] },
                priority: { type: 'string', enum: [...ISSUE_PRIORITIES] },
                dueDate: { type: ['string', 'null'] },
                status: { type: 'string', enum: [...ISSUE_STATUSES] },
                blockedReason: { type: 'string', description: 'Who must do what for the work to go on. With status blocked.' },
                assignee: ASSIGNEE,
            },
            required: ['ref'],
        },
    },
    {
        name: 'comment_issue',
        description: 'Comment on an issue, as the person the key belongs to. A comment on an issue assigned to a coworker wakes it to read and answer, unless one of its runs is already on it.',
        inputSchema: { type: 'object', properties: { ref: REF, body: { type: 'string', description: 'Markdown.' } }, required: ['ref', 'body'] },
    },
] as const
