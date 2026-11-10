import { isPaidSubscription } from '@lumvika/cloud/billing'

// An agent installed from a template carries the work of whoever authored it: its skills, its
// system prompt, the prompts behind its schedules and triggers. A free trial is enough to install
// a template, copy all of it out and cancel before the first charge, so that content stays sealed
// until the workspace has actually been charged. The agent still runs: this locks reading it, not
// using it.
//
// Pure and isomorphic on purpose. The server masks the payload with it (the authority) and the
// client draws the overlay with it (the appearance), so the rule is stated once.

type LockableAgent = { templateId: string | null }
type LockableWorkspace = { subscription_status: string | null; is_sandbox: boolean } | null | undefined

export function isTemplateContentLocked(agent: LockableAgent, workspace: LockableWorkspace): boolean {
    if (!agent.templateId) return false
    // A sandbox is the expert perk where templates are authored and captured. Sealing it would
    // lock authors out of their own work.
    if (workspace?.is_sandbox) return false
    return !isPaidSubscription(workspace?.subscription_status)
}

// What a disabled control says for itself, in one voice. `action` reads as the subject of the
// sentence: templateLockTooltip('Downloading this skill') → "Downloading this skill unlocks…".
export function templateLockTooltip(action: string): string {
    return `${action} unlocks once your workspace is on a paid plan.`
}

export type LockedContentKind = 'skill' | 'soul' | 'schedule' | 'trigger' | 'file'

const LOREM = [
    'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
    'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.',
    'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
    'Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.',
]

const HEADINGS: Record<LockedContentKind, string> = {
    skill: '# Procedure',
    soul: '# System prompt',
    schedule: '# Task prompt',
    trigger: '# Webhook prompt',
    file: '# Reference',
}

// What the client gets instead of the real thing. Deterministic filler, never derived from the
// content it replaces: an inspector on a blurred panel must find nothing but this. The length is
// rounded to a coarse step so the blurred block keeps a plausible height without leaking the size
// of what it stands for.
export function lockedPlaceholder(kind: LockedContentKind, realLength: number): string {
    const target = Math.min(2000, Math.max(400, Math.ceil(realLength / 400) * 400))
    const lines: string[] = [HEADINGS[kind], '']
    let length = lines.join('\n').length
    for (let i = 0; length < target; i++) {
        const line = LOREM[i % LOREM.length]
        lines.push(line, '')
        length += line.length + 2
    }
    return lines.join('\n')
}
