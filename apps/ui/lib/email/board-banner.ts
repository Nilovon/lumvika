// No 'server-only', see lib/email/client.ts: the lifecycle sweeper builds its banners from a
// Trigger.dev task.
import { SCENE_HEIGHT, SCENE_WIDTH } from '@lumvika/emails'
import type { DbScope } from '@/lib/db'
import { boardImageUrl } from '@/lib/og/board-image'
import { loadTeam, teamBoardScene, type TeamMember, type TeamStatus } from '@/lib/og/team-board'
import { warmImage } from '@/lib/og/warm'

// A sweep can afford to wait for a cold capture. A request someone is waiting on (an engine
// webhook, an invitation, a Stripe event) cannot, and sends the usual banner instead: the next
// email with the same board finds it in lumvika-shot's cache.
export const BANNER_WARM_BACKGROUND_MS = 25_000
export const BANNER_WARM_INLINE_MS = 6_000

/**
 * The workspace's own board, framed like the scene of an email, or undefined when it could not be
 * captured in time: the message then opens on its usual picture. Never throws, a missing banner
 * costs the message its illustration and never its delivery.
 */
export async function emailBoardBanner(scope: DbScope, workspaceId: number, status: TeamStatus, timeoutMs: number): Promise<string | undefined> {
    try {
        const team = await loadTeam(scope, workspaceId, typeof status === 'string' ? [] : Object.keys(status))
        return await teamBoardBanner(team, status, timeoutMs)
    } catch (error) {
        console.error('[email] board banner failed', workspaceId, error)
        return undefined
    }
}

// For a sender that already holds the team, to read it once for the email and the WhatsApp message.
export async function teamBoardBanner(team: TeamMember[], status: TeamStatus, timeoutMs: number): Promise<string | undefined> {
    try {
        const url = boardImageUrl(teamBoardScene(team, status), { width: SCENE_WIDTH, height: SCENE_HEIGHT })
        return (await warmImage(url, timeoutMs)) ? url : undefined
    } catch (error) {
        console.error('[email] board banner failed', error)
        return undefined
    }
}
