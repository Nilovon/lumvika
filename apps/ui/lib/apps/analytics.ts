// No 'server-only': the trial sweep reports from Trigger.dev.
import type { AnalyticsEventMap, EventName } from '@lumvika/analytics'
import { captureServer } from '@lumvika/analytics/server'
import { selectMany, type DbScope } from '@/lib/db'
import { loadAuthAccount } from '@/lib/notifications/recipient'

// The first member's login email is the distinct_id the rest of the workspace's events use. Best
// effort, like every reporter: analytics never fails the change it reports.
export async function reportWorkspaceEvent<E extends EventName>(scope: DbScope, workspaceId: number, event: E, properties: AnalyticsEventMap[E]): Promise<void> {
    try {
        const { data: members } = await selectMany(scope, 'workspace_members', ['user_id'] as const, { workspace_id: workspaceId }, { column: 'created_at' }, 1)
        const owner = members?.[0]
        if (!owner) return
        const account = await loadAuthAccount(scope, owner.user_id)
        if (account?.email) await captureServer(account.email, event, properties)
    } catch (err) {
        console.warn(`[apps] could not report ${event}`, err)
    }
}
