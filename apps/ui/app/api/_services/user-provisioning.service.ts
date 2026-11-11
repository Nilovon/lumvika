import type { Json } from '@/app/api/database.types'
import { grantLumvikaTopup } from '@lumvika/cloud/billing.server'
import { BASE_PLAN_SLUG, baseLimitsToColumns, SIGNUP_BUDGET_MICROS, type PriceArm } from '@lumvika/cloud/billing'
import { randomBlob } from '@/lib/blobs/catalog'
import { DEFAULT_NOTIFICATION_PREFS } from '@/lib/notifications/prefs'
import { deleteRows, insertRow, insertRows, selectMaybeSingle, serviceScope, updateRows, type DbScope } from '@/lib/db'
import { DEFAULT_LOCALE, type Locale } from '@lumvika/i18n'

// The account as the auth layer hands it over.
export type ProvisionedAccount = { id: string; isAnonymous: boolean }

// Just-in-time provisioning: the first time an authenticated user (real or anonymous) is seen, seed
// their workspace, user row and owner membership. The request client only reads the users row;
// every write goes through the service role, so the browser holds no write on public.users at all
// (an INSERT it could make would let it plant its row on any workspace before this ran). The `id`
// comes from the verified auth user, which is what auth.uid() would have tied it to.
// Answers whether the account is now provisioned and its signup stamped, null when something
// failed and the next request has to try again.
//
// `priceArm` is the arm of the price test a workspace born on this request is frozen on, null to
// leave it out of the test.
//
// `locale` is the language of the request (the visitor's cookie, else the browser): a workspace born
// on it has its coworkers write in that language when they work on their own.
export async function provisionUser(
    scope: DbScope,
    user: ProvisionedAccount,
    { priceArm, locale = DEFAULT_LOCALE }: { priceArm: PriceArm | null; locale?: Locale },
): Promise<{ signedUp: boolean } | null> {
    const existingUser = await selectMaybeSingle(scope, 'users', ['id', 'workspace_id', 'signed_up_at'] as const, { id: user.id })

    // Only a query that came back clean can be read as "this user has no row yet". A failed read
    // (a column the deployed code knows and the database does not, a network blip) says nothing
    // about the user, and treating it as unprovisioned mints a throwaway workspace and membership
    // on every single navigation for as long as the failure lasts.
    if (existingUser.error) {
        console.error('Error reading user for provisioning', existingUser.error)
        return null
    }

    if (existingUser.data) {
        return { signedUp: await stampSignup(user, existingUser.data.signed_up_at, existingUser.data.workspace_id) }
    }

    const service = serviceScope()

    const { data: workspace, error: workspaceError } = await insertRow(
        service,
        'workspaces',
        {
            name: 'My workspace',
            icon_url: randomBlob()?.url ?? null,
            plan: BASE_PLAN_SLUG,
            ...baseLimitsToColumns(),
            // The plan's credit belongs to the plan: an account with no subscription gets the
            // signup allowance below and nothing else, or a visitor who never pays walks off with
            // five dollars of Lumvika credit.
            lumvika_budget_micros: 0,
            price_arm: priceArm,
            locale,
        },
        ['id']
    )

    // Without a workspace the users row cannot satisfy its NOT NULL workspace_id, so bail out
    // and let the next request retry the whole provisioning rather than leave a half-seeded user.
    if (workspaceError || !workspace) {
        console.error('Error creating workspace', workspaceError)
        return null
    }

    const { error: userError } = await insertRows(service, 'users', {
        id: user.id,
        workspace_id: workspace.id,
        email_notification_prefs: DEFAULT_NOTIFICATION_PREFS as unknown as Json,
        signed_up_at: user.isAnonymous ? null : new Date().toISOString(),
    })

    // The workspace is worthless without the user it was seeded for, and a failure that repeats on
    // the next navigation would pile one up per request, so it goes back out with the retry.
    if (userError) {
        console.error('Error creating user', userError)
        await deleteRows(service, 'workspaces', { id: workspace.id })
        return null
    }

    const { error: membershipError } = await insertRows(service, 'workspace_members', {
        user_id: user.id,
        workspace_id: workspace.id,
        role: 'admin',
    })
    if (membershipError) console.error('Error creating membership', membershipError)

    // An account created already signed in, a Google sign-up rather than an anonymous visit that
    // was upgraded, never passes through stampSignup: its allowance is granted here.
    if (!user.isAnonymous) {
        await grantLumvikaTopup(workspace.id, SIGNUP_BUDGET_MICROS)
    }
    return { signedUp: !user.isAnonymous }
}


// An anonymous visitor is provisioned a users row on their first page view and the account dialog
// then upgrades that same auth user in place, so `created_at` says when they first landed, not when
// they signed up. This is the one place both facts are in hand at once, on a query the middleware
// keeps running until the stamp is down: the write happens once in an account's life, and a missed
// one is picked up on the next request. Written with the service role so the column, which decides
// who gets a lifecycle email and when, stays out of reach of the browser. Answers whether the column
// is set once it is done.
async function stampSignup(user: ProvisionedAccount, signedUpAt: string | null, workspaceId: number): Promise<boolean> {
    if (user.isAnonymous) return false
    if (signedUpAt) return true
    // Conditional on the column still being empty, and read back: the requests that follow a signup
    // arrive together, each with the row it read before any of them wrote, and only the one whose
    // write landed grants the allowance.
    const { data: stamped, error } = await updateRows(serviceScope(), 'users', { signed_up_at: new Date().toISOString() }, { id: user.id, signed_up_at: { isNull: true } }, ['id'])
    if (error) return false
    if (!stamped?.length) return true
    // Same write, same one-shot guard: the allowance is granted exactly when an account stops being
    // anonymous, which is also when the steward starts talking to it.
    await grantLumvikaTopup(workspaceId, SIGNUP_BUDGET_MICROS)
    return true
}
