import { tool, type ToolSet } from 'ai'
import { z } from 'zod'
import type { RunContext } from '../../runtime/context.js'
import { markSetupComplete } from '../../agents/setup.js'
import { activateAutomations } from '../../agents/automations.js'
import { getAgent } from '../../agents/registry.js'

function closingInstruction(activated: { schedules: string[]; triggers: string[] }): string {
    const counts = [
        activated.schedules.length > 0 ? `${activated.schedules.length} scheduled task${activated.schedules.length === 1 ? '' : 's'}` : '',
        activated.triggers.length > 0 ? `${activated.triggers.length} webhook${activated.triggers.length === 1 ? '' : 's'}` : '',
    ].filter(Boolean)
    if (counts.length === 0) return 'Setup is recorded as complete. Tell the user in one short message what they can now ask you for.'
    return `Setup is recorded as complete and ${counts.join(' and ')} switched on. Tell the user in one short message what they can now ask you for, and say when the automations will next run.`
}

export function installTools(ctx: RunContext): ToolSet {
    return {
        install_complete: tool({
            description:
                'Mark this coworker\'s guided setup as done. Call it only once everything the setup instructions asked for is actually in place and you have verified it works. Until you call it, the user cannot chat with you normally: every new conversation opens on the "Start installation" button instead of the message box. If something is still missing, ask for it with ask_user rather than calling this, unless the user explicitly chose to go on without it. Calling it also switches on every scheduled task and webhook you carry.',
            inputSchema: z.object({
                summary: z.string().optional().describe('One or two sentences on what was set up, shown to the user as the closing note.'),
            }),
            execute: async ({ summary }) => {
                await markSetupComplete(ctx.agent.id)
                const activated = await activateAutomations(await getAgent(ctx.agent.id))
                return { status: 'complete', summary: summary ?? '', activated, instruction: closingInstruction(activated) }
            },
        }),
    }
}
