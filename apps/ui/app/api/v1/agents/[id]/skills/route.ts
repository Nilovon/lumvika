import { listCoworkerSkills } from '@/app/api/_services/coworker-details.service'
import { apiRoute } from '@/app/api/v1/_lib/api-route'

export const dynamic = 'force-dynamic'

export const GET = apiRoute({ auth: 'member' }, async ({ ctx, params }) => listCoworkerSkills(ctx, params.id))
