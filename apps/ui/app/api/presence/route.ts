import { clearPresence, touchPresence, touchSandboxActivity } from '@/app/api/_services/presence.service'
import { createClient } from '@/supabase/server'

// A route handler rather than a server action: only fetch(keepalive) can still reach the server
// while the tab is closing, and that DELETE is what keeps a shut window from looking present for
// another minute and a half.
async function currentUserId(): Promise<string | null> {
    const supabase = await createClient()
    const { data } = await supabase.auth.getUser()
    // Not getServerSession: it also reads users and workspaces, two queries too many on something
    // called twice a minute per tab. An anonymous visitor has no address to be spared.
    if (!data.user || data.user.is_anonymous) return null
    return data.user.id
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
