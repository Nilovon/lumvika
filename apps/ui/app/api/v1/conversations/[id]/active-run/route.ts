import { assertSessionInWorkspace } from '@/app/api/_auth/access'
import { findSessionActiveRun } from '@/app/api/_services/chat.service'
import { apiRoute } from '@/app/api/v1/_lib/api-route'

export const dynamic = 'force-dynamic'

export const GET = apiRoute({ auth: 'member' }, async ({ params }) => {
    await assertSessionInWorkspace(params.id)
    return { runId: await findSessionActiveRun(params.id) }
})
