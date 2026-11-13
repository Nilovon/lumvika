// Runs Better Auth against a real Postgres: `pnpm db:start` first. Skipped when it is not reachable.
import { closeDb, getDb, selectMaybeSingle, serviceScope, userScope } from '@lumvika/db'
import { authUsers } from '@lumvika/db/schema'
import { randomUuid } from '@/lib/random-uuid'
import { resetTestDatabase, testDatabaseReachable, testDatabaseUrl } from '@lumvika/db/testing'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const sentCodes = new Map<string, string>()
vi.mock('@/app/api/_services/email.service', () => ({
    sendSignInCodeEmail: async ({ to, code }: { to: string; code: string }) => {
        sentCodes.set(to, code)
        return { ok: true, id: null }
    },
}))
vi.mock('@lumvika/cloud/billing.server', () => ({ grantLumvikaTopup: async () => undefined }))

const reachable = await testDatabaseReachable()

function cookieOf(headers: Headers): string {
    return headers
        .getSetCookie()
        .map(cookie => cookie.split(';')[0])
        .join('; ')
}

describe.skipIf(!reachable)('Better Auth on Postgres', () => {
    let auth: ReturnType<typeof import('./auth').getAuth>
    let provisionUser: typeof import('@/app/api/_services/user-provisioning.service').provisionUser

    beforeAll(async () => {
        await resetTestDatabase('lumvika_test_auth')
        process.env.DATABASE_URL = testDatabaseUrl('lumvika_test_auth')
        process.env.BETTER_AUTH_SECRET = 'test-secret-test-secret-test-secret'
        auth = (await import('./auth')).getAuth()
        provisionUser = (await import('@/app/api/_services/user-provisioning.service')).provisionUser
    })

    afterAll(closeDb)

    it('turns an anonymous visitor into an account on the same id', async () => {
        const anonymous = await auth.api.signInAnonymous({ returnHeaders: true })
        const cookie = cookieOf(anonymous.headers)
        const session = await auth.api.getSession({ headers: new Headers({ cookie }) })
        expect(session?.user.id).toMatch(/^[0-9a-f-]{36}$/)
        expect((session?.user as { isAnonymous?: boolean }).isAnonymous).toBe(true)
        const userId = session!.user.id

        expect(await provisionUser(userScope(userId), { id: userId, isAnonymous: true }, { priceArm: null })).toEqual({ signedUp: false })
        const { data: row } = await selectMaybeSingle(serviceScope(), 'users', ['id', 'workspace_id'], { id: userId })
        expect(row?.id).toBe(userId)

        const email = `claim-${Date.now()}@example.com`
        await auth.api.requestEmailChangeEmailOTP({ headers: new Headers({ cookie }), body: { newEmail: email } })
        const code = sentCodes.get(email)
        expect(code).toMatch(/^\d{6}$/)
        await auth.api.changeEmailEmailOTP({ headers: new Headers({ cookie }), body: { newEmail: email, otp: code! } })

        const [stored] = await getDb().select().from(authUsers).where((await import('@lumvika/db')).eq(authUsers.id, userId))
        expect(stored.email).toBe(email)
        expect(stored.isAnonymous).toBe(false)
        expect(stored.emailVerified).toBe(true)
        expect(stored.name).toBe('')
    })

    it('signs an existing address in with a code and resolves its bearer token', async () => {
        const email = `existing-${Date.now()}@example.com`
        await getDb().insert(authUsers).values({ id: randomUuid(), name: '', email, emailVerified: true })

        await auth.api.sendVerificationOTP({ body: { email, type: 'sign-in' } })
        const code = sentCodes.get(email)
        expect(code).toMatch(/^\d{6}$/)
        const signedIn = await auth.api.signInEmailOTP({ body: { email, otp: code! } })
        expect(signedIn.user.email).toBe(email)

        const session = await auth.api.getSession({ headers: new Headers({ authorization: `Bearer ${signedIn.token}` }) })
        expect(session?.user.email).toBe(email)
    })

    it('signs into an account the hub opened unverified for a new address, and verifies it', async () => {
        const email = `opened-${Date.now()}@example.com`
        const id = randomUuid()
        await getDb().insert(authUsers).values({ id, name: '', email, emailVerified: false })

        await auth.api.sendVerificationOTP({ body: { email, type: 'sign-in' } })
        const signedIn = await auth.api.signInEmailOTP({ body: { email, otp: sentCodes.get(email)! } })
        expect(signedIn.user.id).toBe(id)

        const [stored] = await getDb().select().from(authUsers).where((await import('@lumvika/db')).eq(authUsers.id, id))
        expect(stored.emailVerified).toBe(true)
        expect(stored.isAnonymous).toBe(false)
    })

    it('refuses to create an account for an unknown address by code', async () => {
        const email = `unknown-${Date.now()}@example.com`
        await auth.api.sendVerificationOTP({ body: { email, type: 'sign-in' } }).catch(() => undefined)
        const code = sentCodes.get(email) ?? '000000'
        await expect(auth.api.signInEmailOTP({ body: { email, otp: code } })).rejects.toThrow()
    })
})
