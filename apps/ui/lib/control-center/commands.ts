import { BILLING_ENABLED } from '@lumvika/cloud/billing'
import { SUPPORT_CHAT_ENABLED } from '@lumvika/cloud/support'
import { NAV_ITEMS, type NavItemId } from '@/lib/shell/nav'

export const CONTROL_COMMAND_IDS = [
    'new_agent',
    'browse_templates',
    'new_box',
    'ask_assistant',
    'contact_support',
    'recenter_board',
    'toggle_theme',
    'workspace',
    'members',
    'billing',
    'ai_providers',
    'api_keys',
    'company_brain',
    'shared_files',
    'account',
    'notifications',
    'shortcuts',
    'whats_new',
] as const

export type GoToCommandId = `go_${NavItemId}`

export type ControlCommandId = (typeof CONTROL_COMMAND_IDS)[number] | GoToCommandId

export type ControlCommandGroup = 'actions' | 'navigation' | 'settings'

export type ControlCommand = {
    id: ControlCommandId
    group: ControlCommandGroup
    label: string
    keywords: string[]
    disabledReason: string | null
    // Paid plans only: selecting it on another plan opens billing instead of the panel.
    paid: boolean
    // The route a "Go to" command opens.
    href?: string
}

export type ControlGates = {
    isSandbox: boolean
    workspaceAdmin: boolean
    apiEntitled: boolean
    needsMachineReason: string | null
    assistantReady: boolean
    hasChangelog: boolean
    darkTheme: boolean
    // The platform shell is open: its areas get a "Go to" command each.
    platform: boolean
}

// Why a command is disabled, in the reader's language. The English is for the tests and the labs.
export type ControlReasons = { sandbox: string; admin: string; singleBox: string }

const GO_TO: Record<NavItemId, { label: string; keywords: string[] }> = {
    overview: { label: 'Go to Overview', keywords: ['dashboard', 'home', 'summary'] },
    office: { label: 'Go to the Office', keywords: ['board', 'boxes', 'coworkers', 'map'] },
    chat: { label: 'Go to Chat', keywords: ['assistant', 'conversation', 'ask'] },
    work: { label: 'Go to My work', keywords: ['issues', 'assigned', 'inbox', 'todo'] },
    projects: { label: 'Go to Projects', keywords: ['issues', 'board', 'backlog'] },
    goals: { label: 'Go to Goals', keywords: ['objectives', 'okr', 'targets'] },
    review: { label: 'Go to Review', keywords: ['approve', 'check', 'feedback'] },
    channels: { label: 'Go to Channels', keywords: ['messages', 'discussion', 'team chat'] },
    teams: { label: 'Go to Teams', keywords: ['org chart', 'people', 'members'] },
    activity: { label: 'Go to Activity', keywords: ['feed', 'history', 'log', 'updates'] },
}

const ENGLISH_REASONS: ControlReasons = { sandbox: 'The expert sandbox has none of its own', admin: 'Admins only', singleBox: 'A sandbox has a single Box' }

export function buildControlCommands(gates: ControlGates, reasons: ControlReasons = ENGLISH_REASONS): ControlCommand[] {
    const sandboxReason = gates.isSandbox ? reasons.sandbox : null
    const adminReason = sandboxReason ?? (gates.workspaceAdmin ? null : reasons.admin)
    const command = (id: ControlCommandId, group: ControlCommandGroup, label: string, keywords: string[], disabledReason: string | null = null, paid = false): ControlCommand => ({ id, group, label, keywords, disabledReason, paid })

    const commands: (ControlCommand | false)[] = [
        command('new_agent', 'actions', 'New agent', ['create', 'add', 'hire'], gates.needsMachineReason),
        command('browse_templates', 'actions', 'Browse templates', ['library', 'install', 'marketplace'], gates.needsMachineReason),
        command('new_box', 'actions', 'New Box', ['create', 'add', 'team', 'group'], gates.isSandbox ? reasons.singleBox : null),
        gates.assistantReady && command('ask_assistant', 'actions', 'Ask the assistant', ['help', 'steward', 'chat']),
        SUPPORT_CHAT_ENABLED && command('contact_support', 'actions', 'Contact Support', ['help', 'chat', 'crisp', 'contact', 'bug', 'question', 'talk to us']),
        command('recenter_board', 'actions', 'Recenter the board', ['camera', 'zoom', 'fit', 'reset view']),
        command('toggle_theme', 'actions', gates.darkTheme ? 'Switch to light theme' : 'Switch to dark theme', ['appearance', 'mode', 'dark', 'light']),

        command('workspace', 'settings', 'Workspace settings', ['name', 'logo', 'rename', 'delete'], adminReason),
        command('members', 'settings', 'Members', ['invite', 'team', 'seats', 'people', 'roles'], sandboxReason),
        BILLING_ENABLED && command('billing', 'settings', 'Billing', ['plan', 'subscription', 'invoices', 'payment', 'upgrade', 'credits'], adminReason),
        command('ai_providers', 'settings', 'AI providers', ['models', 'claude', 'chatgpt', 'openai', 'anthropic', 'api key', 'subscription']),
        command('api_keys', 'settings', 'API keys & MCP', ['token', 'developer', 'mcp client'], gates.workspaceAdmin ? null : reasons.admin, !gates.apiEntitled),
        command('company_brain', 'settings', 'Company Brain', ['knowledge', 'wiki', 'pages', 'context']),
        command('shared_files', 'settings', 'Shared files', ['folder', 'documents', 'uploads']),
        command('account', 'settings', 'Account', ['profile', 'email', 'password', 'sign-in', 'avatar']),
        command('notifications', 'settings', 'Notifications', ['alerts', 'email', 'push', 'slack']),
        command('shortcuts', 'settings', 'Keyboard shortcuts', ['keys', 'hotkeys']),
        gates.hasChangelog && command('whats_new', 'settings', "What's new", ['changelog', 'updates', 'release']),

        ...(gates.platform ? NAV_ITEMS.map(({ id, href }): ControlCommand => ({ ...command(`go_${id}`, 'navigation', GO_TO[id].label, GO_TO[id].keywords), href })) : []),
    ]

    return commands.filter((entry): entry is ControlCommand => entry !== false)
}

const MAX_RECENT_AGENTS = 5

// Most recent first, each agent once.
export function pushRecentAgent(recent: readonly string[], agentId: string): string[] {
    return [agentId, ...recent.filter(id => id !== agentId)].slice(0, MAX_RECENT_AGENTS)
}
