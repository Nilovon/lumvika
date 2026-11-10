import { requireWorkspaceContext } from '@/app/api/_auth/ownership'
import { catchUpEngineSteps, catchUpPaymentMethod, grantGettingStartedReward, markGettingStarted, readGettingStartedItems, reportGettingStartedSteps } from '@/app/api/_services/getting-started.service'

// A route and not a server action: the catch-up can wait on a slow machine, and server actions run
// one after the other, so every action fired on the board's first paint would queue behind it.
//
// Run on the board's first paint, and again once the pill is full. Realtime ticks every step
// the moment it happens; this only catches up on what the machine did before it could say so and
// on a card put on file outside the checklist, and is the one place the trial days are granted. It
// is also where the steps a trigger ticked reach analytics, the trigger having no way to say so.
// `dismissed` tells the profile menu the list is only hidden, and can be brought back.
export async function POST(): Promise<Response> {
    let ctx: Awaited<ReturnType<typeof requireWorkspaceContext>>
    try {
        ctx = await requireWorkspaceContext()
    } catch {
        return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (ctx.workspace.is_sandbox) return Response.json({ visible: false })

    const workspaceId = ctx.workspace.id
    await reportGettingStartedSteps(ctx.supabase, workspaceId)
    const items = await readGettingStartedItems(ctx.supabase, workspaceId)
    if (items.has('dismissed')) return Response.json({ visible: false, dismissed: true })

    const found = (await Promise.all([catchUpEngineSteps(ctx.supabase, workspaceId, items), catchUpPaymentMethod(ctx.supabase, workspaceId, items)])).flat()
    await markGettingStarted(ctx.supabase, workspaceId, found)
    for (const item of found) items.add(item)

    await grantGettingStartedReward(ctx.supabase, workspaceId, items)
    return Response.json({ visible: true })
}
