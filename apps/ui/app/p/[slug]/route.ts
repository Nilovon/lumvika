import { publishedSiteOrigin } from '@/lib/published/host'
import { PUBLISHED_BUCKET } from '@/lib/services/publish'
import { loadPublished } from '@/lib/published/gate'
import { getAuthUser } from '@/lib/auth/session/getServerSession'
import { selectMaybeSingle, serviceScope } from '@/lib/db'
import { signedUrl } from '@lumvika/storage'

// The first links a coworker shared, before every link had its own host. Where a publish host is
// configured they all lead there, which checks the access. Without one (staging, a self-hosted app
// with no wildcard domain) there is no host to hold a gate's cookie: a public file opens through a
// short signed URL, and any other only for a signed-in member of its workspace.
export const dynamic = 'force-dynamic'

const SIGNED_URL_TTL_SECONDS = 60

async function isMember(workspaceId: number): Promise<boolean> {
    const user = await getAuthUser()
    if (!user || user.isAnonymous) return false
    const { data: membership } = await selectMaybeSingle(serviceScope(), 'workspace_members', ['user_id'] as const, { user_id: user.id, workspace_id: workspaceId })
    return !!membership
}

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }): Promise<Response> {
    const { slug } = await params
    const entry = await loadPublished(slug)
    if (!entry) return new Response('Not found', { status: 404 })

    const origin = publishedSiteOrigin(slug)
    if (origin) return Response.redirect(`${origin}/`, 302)

    if (entry.kind === 'site') return new Response('Not found', { status: 404 })
    if (entry.access !== 'public' && !(await isMember(entry.workspace_id))) return new Response('Not found', { status: 404 })

    const { data: url } = await signedUrl(PUBLISHED_BUCKET, entry.storage_key, SIGNED_URL_TTL_SECONDS)
    return url ? Response.redirect(url, 302) : new Response('Not found', { status: 404 })
}
