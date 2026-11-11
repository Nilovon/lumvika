import { memberActor, workspaceActor, type Actor } from '@/app/api/_auth/access'
import { STEWARD_AGENT_ID, STEWARD_HUB_TOKEN_HEADER } from '@lumvika/contracts'

import { dispatchStewardHubTool } from '@/app/api/_services/steward-hub.service'
import { dispatchHubTool } from '@/app/api/_services/services.service'
import { dispatchTeamHubTool, isTeamHubTool } from '@/app/api/_services/team-hub.service'
import { authenticateEngineToken } from '@/app/api/_services/workspace-engine.service'
import { stewardHubTokenRequired, verifyStewardHubToken } from '@/lib/steward/hub-token'
import { selectMaybeSingle, serviceScope } from '@/lib/db'

// Lumvika Hub REST endpoint. The engine's built-in `lumvika_hub_*` tools call this over
// the public internet, authenticated with its LUMVIKA_API_KEY (same identity as the engine
// webhooks), which names one workspace. The `x-lumvika-agent` header carries the ENGINE agent
// id, resolved here to the agent row of that workspace. Every coworker of the box holds that
// key, so `steward` must also carry the token the hub signed into the steward's brief.
export const dynamic = 'force-dynamic'

export async function POST(req: Request): Promise<Response> {
    const header = req.headers.get('authorization') ?? ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : ''
    const engine = await authenticateEngineToken(token)
    if (!engine) {
        console.warn('[hub] rejected request with invalid/absent engine key')
        return new Response('Unauthorized', { status: 401 })
    }

    const engineAgentId = req.headers.get('x-lumvika-agent') ?? ''
    if (!engineAgentId) return new Response('Missing x-lumvika-agent header', { status: 400 })

    // The steward has no agent row: it speaks for the whole workspace the engine key names.
    const isSteward = engineAgentId === STEWARD_AGENT_ID
    // The person the steward's turn speaks for, from its signed token: their access, not the
    // workspace's. A token without one (minted before, or no token at all) acts as the workspace.
    let stewardActor: Actor = workspaceActor(engine.workspaceId)
    if (isSteward) {
        const stewardToken = req.headers.get(STEWARD_HUB_TOKEN_HEADER)
        if (stewardToken) {
            const claims = verifyStewardHubToken(stewardToken, engine.workspaceId)
            if (!claims) return new Response('Invalid steward token', { status: 403 })
            if (claims.uid) {
                const member = await memberActor(engine.workspaceId, claims.uid)
                if (!member) return new Response('The member this steward speaks for has left the workspace', { status: 403 })
                stewardActor = member
            }
        } else if (stewardHubTokenRequired()) {
            return new Response('Missing steward token', { status: 403 })
        } else {
            console.warn('[hub] steward call without token (tolerated)', { workspaceId: engine.workspaceId })
        }
    }
    const { data: agent } = isSteward ? { data: null } : await selectMaybeSingle(serviceScope(), 'agents', ['id'] as const, { engine_agent_id: engineAgentId, workspace_id: engine.workspaceId })
    if (!isSteward && !agent) return new Response('Coworker does not belong to the authenticated workspace', { status: 403 })

    let body: { tool?: string; args?: Record<string, unknown> }
    try {
        body = await req.json()
    } catch {
        return new Response('Invalid JSON', { status: 400 })
    }

    const tool = typeof body.tool === 'string' ? body.tool : ''
    const args = (body.args ?? {}) as Record<string, unknown>
    if (!tool) return new Response('Missing tool', { status: 400 })

    try {
        const out = !agent
            ? await dispatchStewardHubTool(stewardActor, tool, args)
            : isTeamHubTool(tool)
              ? await dispatchTeamHubTool(agent.id, engine.workspaceId, tool, args)
              : await dispatchHubTool(agent.id, tool, args, engine.workspaceId)
        return Response.json(out)
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Hub tool failed'
        console.error(`[hub] ${tool} failed:`, message)
        return Response.json({ error: message })
    }
}
