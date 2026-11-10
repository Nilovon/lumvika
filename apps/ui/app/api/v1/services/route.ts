import { actorFromContext } from '@/app/api/_auth/access'
import { searchServices } from '@/app/api/_services/services.service'
import { apiRoute } from '@/app/api/v1/_lib/api-route'
import { toSearchResultView } from '@/app/api/v1/_lib/service-view'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const querySchema = z.object({ agentId: z.string().min(1), query: z.string().optional(), category: z.string().optional() })

export const GET = apiRoute({ auth: 'member', query: querySchema }, async ({ ctx, query }) => {
    const { results } = await searchServices(query.agentId, query.query, query.category, actorFromContext(ctx))
    return results.map(toSearchResultView)
})
