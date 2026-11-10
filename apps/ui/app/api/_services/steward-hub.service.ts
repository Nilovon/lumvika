import 'server-only'

import type { Actor } from '@/app/api/_auth/access'
import { workspaceFounderUserId } from '@/app/api/_auth/ownership'
import { dispatchAccountTool } from '@/app/api/_services/mcp-account.service'
import { dispatchBoxTool } from '@/lib/steward/box-tools'
import { STEWARD_ENGINE_HUB_TOOL_NAMES, STEWARD_ENGINE_ONBOARDING_TOOL_NAMES } from '@/lib/steward/engine-brief'
import { dispatchWorkspaceOnboardingTool } from '@/lib/steward/onboarding-tools'
import { searchStewardDocs } from '@/lib/steward/search-docs'
import { STEWARD_BOX_TOOL_DEFS } from '@/lib/steward/tool-defs'
import { requireString } from '@/lib/mcp/args'
import { createServiceRoleClient } from '@/supabase/serviceRole'

const BOX_TOOL_NAMES = new Set<string>(STEWARD_BOX_TOOL_DEFS.map(def => def.name))

// What the engine steward may do to its workspace, and nothing more: the same allowlist the hub
// hands it as its belt, so a tool name it was never given is refused here too.
export async function dispatchStewardHubTool(actor: Actor, tool: string, args: Record<string, unknown>): Promise<unknown> {
    const workspaceId = actor.workspaceId
    if (!STEWARD_ENGINE_HUB_TOOL_NAMES.has(tool)) throw new Error(`Unknown steward tool: ${tool}`)

    if (tool === 'search_docs') return searchStewardDocs(requireString(args.query, 'query'))

    // The turn speaks for the member who wrote it: a Box they create is theirs to manage, a coworker
    // lands only in a Box they manage, and only their Boxes are listed. A turn with nobody behind it
    // speaks for the workspace, as the account owner.
    const userId = actor.kind === 'user' ? actor.userId : await founderOf(workspaceId)
    if (BOX_TOOL_NAMES.has(tool)) return dispatchBoxTool({ workspaceId, userId, actor }, tool, args)
    if (STEWARD_ENGINE_ONBOARDING_TOOL_NAMES.has(tool)) return dispatchWorkspaceOnboardingTool({ supabase: createServiceRoleClient(), userId, workspace: { id: workspaceId }, actor }, tool, args)

    return dispatchAccountTool(actor, tool, args, { actorUserId: actor.kind === 'user' ? actor.userId : null })
}

async function founderOf(workspaceId: number): Promise<string> {
    const userId = await workspaceFounderUserId(workspaceId)
    if (!userId) throw new Error('This workspace has no member to act for.')
    return userId
}
