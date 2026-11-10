import { actorFromContext } from '@/app/api/_auth/access'
import { checkAllAgentsHealth } from '@/app/api/_services/gateway.service'
import { apiRoute } from '@/app/api/v1/_lib/api-route'

export const dynamic = 'force-dynamic'

export const GET = apiRoute({ auth: 'member' }, async ({ ctx }) => (await checkAllAgentsHealth(actorFromContext(ctx))).statuses)
