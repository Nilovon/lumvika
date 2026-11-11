import { listUserWorkspaces } from '@/app/api/_services/workspace.service'
import { apiRoute } from '@/app/api/v1/_lib/api-route'

export const dynamic = 'force-dynamic'

export const GET = apiRoute({ auth: 'user' }, async ({ ctx }) => listUserWorkspaces(ctx.scope, ctx.user.id))
