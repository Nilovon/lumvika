import { z } from 'zod'

import { nextIssuesFor, releaseStaleCheckouts } from '@/app/api/_services/work/work-queue.service'
import { authenticateEngineToken } from '@/app/api/_services/workspace-engine.service'
import { serviceScope } from '@/lib/db'

// The heartbeat of a box (engine `runtime/issue-queue.ts`), authenticated with its engine key, which
// names one workspace: the checkouts no live run of the box holds any more are let go, and each idle
// coworker it names is handed the issue it should take next.
export const dynamic = 'force-dynamic'

const bodySchema = z.object({
    // `wokenAt`: when each skipped issue was woken. Absent from an engine older than it, which then
    // keeps every skipped issue back for its cooldown.
    coworkers: z.array(z.object({ agentId: z.string().min(1), skipRefs: z.array(z.string()).max(500).default([]), wokenAt: z.record(z.string(), z.string()).optional() })).max(500),
    liveRunIds: z.array(z.string()).max(5000),
})

export async function POST(req: Request): Promise<Response> {
    const header = req.headers.get('authorization') ?? ''
    const engine = await authenticateEngineToken(header.startsWith('Bearer ') ? header.slice(7) : '')
    if (!engine) return new Response('Unauthorized', { status: 401 })

    const parsed = bodySchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return new Response('Invalid payload', { status: 400 })

    const scope = { workspaceId: engine.workspaceId, db: serviceScope() }
    const now = Date.now()
    try {
        const released = await releaseStaleCheckouts(scope, parsed.data.liveRunIds, now)
        const runs = await nextIssuesFor(scope, parsed.data.coworkers, now)
        return Response.json({ runs, released })
    } catch (err) {
        console.error('[work-queue] failed', err)
        return Response.json({ error: 'Work queue failed' }, { status: 500 })
    }
}
