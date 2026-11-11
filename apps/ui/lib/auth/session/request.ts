import 'server-only'
import { anonScope, userScope, type DbScope } from '@/lib/db'
import { getAuth } from '@/lib/auth/auth'
import { readQueryWorkspace } from '@/lib/workspace/query-workspace'
import { WORKSPACE_HEADER } from '@/lib/workspace/workspace-header'
import { headers } from 'next/headers'
import { cache } from 'react'

export type RequestAuth = NonNullable<Awaited<ReturnType<ReturnType<typeof getAuth>['api']['getSession']>>>

// The session the request carries: the browser's cookie, or the mobile app's `Authorization: Bearer`.
// Outside a request (build time, scripts, Trigger.dev) `headers()` throws, which reads as no session.
export const getRequestAuth = cache(async (): Promise<RequestAuth | null> => {
    let requestHeaders: Headers
    try {
        requestHeaders = await headers()
    } catch {
        return null
    }
    return getAuth().api.getSession({ headers: requestHeaders })
})

// Who the request's queries run as: the signed-in user under row level security, else an anonymous
// visitor that reaches only what the policies open to everyone.
export const getRequestScope = cache(async (): Promise<DbScope> => {
    const auth = await getRequestAuth()
    return auth ? userScope(auth.user.id) : anonScope()
})

// Each device, and each browser tab, keeps its own active workspace and names it on every request
// instead of moving `users.workspace_id` under the others. A request naming none (a page load, an
// OAuth callback) follows the stored column. NaN stands for a header that is present but not an id.
export async function getRequestWorkspaceId(): Promise<number | null> {
    try {
        const raw = (await headers()).get(WORKSPACE_HEADER) ?? readQueryWorkspace()
        if (raw === null) return null
        return /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : Number.NaN
    } catch {
        return null
    }
}
