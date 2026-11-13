import type { ToolSet } from 'ai'
import { CLI_PROVIDERS } from '../agents/providers.js'
import type { RunContext } from '../runtime/context.js'
import { brainReadTools } from './builtin/brain.js'
import { webTools } from './builtin/web.js'

// One assistant answers every member of the workspace, so it gets nothing that reads or keeps what
// another conversation left behind: no files, shell, databases, memory, skills, schedules, triggers,
// coworkers, publishing, computer or MCP server. Only the public web and the company brain, read-only.
// An allowlist on purpose: a tool family added to the registry later never reaches it by default.
export const ASSISTANT_TOOL_NAMES = ['web_search', 'web_fetch', 'brain_search', 'brain_read'] as const

export function assistantTools(ctx: RunContext): ToolSet {
    const offered: ToolSet = { ...webTools(ctx), ...brainReadTools() }
    const tools: ToolSet = Object.fromEntries(ASSISTANT_TOOL_NAMES.map(name => [name, offered[name]]))
    // A CLI searches with its own tool, on the subscription; see CLAUDE_RUN_TOOLS.
    if (CLI_PROVIDERS.has(ctx.provider)) delete tools.web_search
    return tools
}
