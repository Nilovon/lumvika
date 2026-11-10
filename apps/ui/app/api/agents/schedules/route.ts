import { requireLightSessionActor, type Actor } from '@/app/api/_auth/access'
import { listWorkspaceSchedules } from '@/app/api/_services/workspace-schedules.service'

// What the board counts down to. A route for the same reason as the health poll beside it: a server
// action would queue in front of everything the panel asks for.
export async function GET(): Promise<Response> {
    let actor: Actor
    try {
        actor = await requireLightSessionActor()
    } catch {
        return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return Response.json(await listWorkspaceSchedules(actor))
}
