import { actorFromContext, assertAgentInWorkspace } from '@/app/api/_auth/access'
import { apiRoute } from '@/app/api/v1/_lib/api-route'
import { connectUrl, serviceKeyParam } from '@/app/api/v1/_lib/service-view'
import { APP_RETURN_URL } from '@/lib/oauth/app-return'
import type { ConnectTarget } from '@lumvika/contracts'

export const dynamic = 'force-dynamic'

// For a service already waiting on its sign-in: mints the ticket the in-app browser opens with.
export const POST = apiRoute({ auth: 'member' }, async ({ req, ctx, params }): Promise<ConnectTarget> => {
    await assertAgentInWorkspace(params.id, 'manage', actorFromContext(ctx))
    return { url: connectUrl(req, ctx, params.id, serviceKeyParam(params)), returnUrl: APP_RETURN_URL }
})
