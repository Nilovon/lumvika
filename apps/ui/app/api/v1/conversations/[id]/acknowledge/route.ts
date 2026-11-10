import { assertSessionInWorkspace } from '@/app/api/_auth/access'
import { clearSessionAlert } from '@/app/api/_services/chat.service'
import { apiRoute } from '@/app/api/v1/_lib/api-route'

export const dynamic = 'force-dynamic'

export const POST = apiRoute({ auth: 'member' }, async ({ params }) => {
    await assertSessionInWorkspace(params.id)
    await clearSessionAlert(params.id)
})
