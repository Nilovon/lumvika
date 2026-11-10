import { actorFromContext } from '@/app/api/_auth/access'
import { apiRoute } from '@/app/api/v1/_lib/api-route'
import { resolveServices } from '@/app/api/v1/_lib/service-view'
import { resolveServicesInputSchema } from '@lumvika/contracts'

export const dynamic = 'force-dynamic'

// The app-setup block's cards in one call: details and catalog metadata for every suggested slug.
export const POST = apiRoute({ auth: 'member', body: resolveServicesInputSchema }, async ({ ctx, params, body }) => resolveServices(params.id, body.services, actorFromContext(ctx)))
