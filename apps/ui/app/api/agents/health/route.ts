import { requireLightSessionActor, type Actor } from '@/app/api/_auth/access'
import { checkAllAgentsHealth } from '@/app/api/_services/gateway.service'

// The board's health poll. A route rather than a server action: actions from one page run one after
// the other, and a poll every ten seconds sat in front of everything the panel asked for. Outside
// /api/v1 on purpose, so the middleware keeps refreshing the session it reads.
export async function GET(): Promise<Response> {
    let actor: Actor
    try {
        actor = await requireLightSessionActor()
    } catch {
        return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return Response.json(await checkAllAgentsHealth(actor))
}
