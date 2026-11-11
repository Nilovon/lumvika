import { accountDeletionBlockers, anonymizeAccount } from '@/app/api/_services/account-deletion.service'
import { apiRoute } from '@/app/api/v1/_lib/api-route'
import { getRequestAuth } from '@/lib/auth/session/request'
import { serviceScope } from '@/lib/db'
import { ACCOUNT_DELETION_REAUTH_MS, deleteAccountRequestSchema, REAUTH_REQUIRED } from '@lumvika/contracts'

export const dynamic = 'force-dynamic'

// What stands in the way of deleting the account: a workspace only this user holds, still billed.
export const GET = apiRoute({ auth: 'user' }, async ({ ctx }) => ({ blockers: await accountDeletionBlockers(serviceScope(), ctx.user.id) }))

// Irreversible, so a token alone is not enough: the person signed in minutes ago, or signs in again.
// Every sign-in opens a new session, so the session's birth is the last sign-in. The cookie cache
// hands it back as a string, the database as a Date.
export const DELETE = apiRoute({ auth: 'user', body: deleteAccountRequestSchema }, async ({ ctx }) => {
    const sessionCreatedAt = (await getRequestAuth())?.session.createdAt
    const signedInAt = sessionCreatedAt ? new Date(sessionCreatedAt).getTime() : 0
    if (!(signedInAt >= Date.now() - ACCOUNT_DELETION_REAUTH_MS)) return Response.json({ error: 'Sign in again to delete your account.', reason: REAUTH_REQUIRED }, { status: 403 })

    const result = await anonymizeAccount(serviceScope(), ctx.user.id)
    if (result.ok) return undefined
    return Response.json({ error: `Cancel the subscription of ${result.blockers.map(blocker => blocker.name).join(', ')} first.`, blockers: result.blockers }, { status: 409 })
})
