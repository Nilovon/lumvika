import { secretMatches } from '@/lib/secure-compare'
import { selectMaybeSingle, serviceScope } from '@/lib/db'
import { triggerTask } from '@lumvika/cloud/tasks'
import type { prefillExpertApplicationTask } from '@/trigger/prefill-expert-application'

// Called by the landing right after someone applies to the expert program: the scrape + LLM
// pipeline lives here, so the landing only asks for it. Service-to-service, hence a shared secret
// rather than a session. The route hands the work to Trigger.dev and returns immediately.
export async function POST(req: Request) {
    const secret = process.env.EXPERTS_PREFILL_SECRET
    if (!secret) return Response.json({ error: 'EXPERTS_PREFILL_SECRET is not configured' }, { status: 500 })
    if (!secretMatches(req.headers.get('x-prefill-secret'), secret)) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    let expertId: string | undefined
    try {
        const body = (await req.json()) as { expertId?: unknown }
        if (typeof body?.expertId === 'string') expertId = body.expertId
    } catch {
        // falls through to the 400 below
    }
    if (!expertId) return Response.json({ error: 'expertId is required' }, { status: 400 })

    // Only a fiche that came from the public form is fair game: the endpoint can never be used to
    // re-scrape (and silently rewrite the blanks of) a marketplace expert.
    const { data: expert } = await selectMaybeSingle(serviceScope(), 'experts', ['id', 'source'] as const, { id: expertId })
    if (!expert || expert.source !== 'application') return Response.json({ error: 'Not an application' }, { status: 404 })

    await triggerTask<typeof prefillExpertApplicationTask>('prefill-expert-application', { expertId })
    return Response.json({ queued: true }, { status: 202 })
}
