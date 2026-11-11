import { clearPresence, touchPresence, touchSandboxActivity } from '@/app/api/_services/presence.service'
import { getAuthUser } from '@/lib/auth/session/getServerSession'

// A route handler rather than a server action: only fetch(keepalive) can still reach the server
// while the tab is closing, and that DELETE is what keeps a shut window from looking present for
// another minute and a half.
async function currentUserId(): Promise<string | null> {
    // Not getServerSession: it also reads users and workspaces, two queries too many on something
    // called twice a minute per tab. An anonymous visitor has no address to be spared.
    const user = await getAuthUser()
    if (!user || user.isAnonymous) return null
    return user.id
}

export async function POST(): Promise<Response> {
    const userId = await currentUserId()
    if (userId) await Promise.all([touchPresence(userId), touchSandboxActivity(userId)])
    return new Response(null, { status: 204 })
}

export async function DELETE(): Promise<Response> {
    const userId = await currentUserId()
    if (userId) await clearPresence(userId)
    return new Response(null, { status: 204 })
}
