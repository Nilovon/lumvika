import { actorFromContext } from '@/app/api/_auth/access'
import { readBox } from '@/app/api/_services/space.service'
import { apiRoute } from '@/app/api/v1/_lib/api-route'

export const dynamic = 'force-dynamic'

export const GET = apiRoute({ auth: 'member' }, async ({ ctx, params }) => readBox(actorFromContext(ctx), params.id))
