import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const db = await vi.hoisted(async () => (await import('@/test/db-fake')).fakeDb())
const auth = vi.hoisted(() => ({ existingId: null as string | null, lookupFails: false, inserted: [] as unknown[], insertAnswer: [{ id: 'user-1' }] as { id: string }[], insertFails: false }))

const insertInto = () => ({
    values: (row: unknown) => ({
        onConflictDoNothing: () => ({
            returning: async () => {
                if (auth.insertFails) throw new Error('boom')
                auth.inserted.push(row)
                return auth.insertAnswer
            },
        }),
    }),
})

vi.mock('@/lib/db', async importOriginal => ({
    ...(await importOriginal<object>()),
    ...db.helpers,
    findAuthUserIdByEmail: async () => {
        if (auth.lookupFails) throw new Error('down')
        return auth.existingId
    },
    serviceScope: () => ({ kind: 'service', userId: null, run: (work: (executor: unknown) => Promise<unknown>) => work({ insert: insertInto }) }),
}))

const EMAIL = 'ada@example.com'
const IP = '203.0.113.7'

const stored = (state: { exists?: boolean; blocked?: boolean; claimed?: boolean; existsError?: boolean; claimError?: boolean }) => {
    auth.existingId = state.exists ? 'user-0' : null
    auth.lookupFails = !!state.existsError
    db.answer(call => {
        if (call.table === 'email_domain_is_blocked') return { data: state.blocked ?? false }
        if (call.table === 'claim_email_sign_up') return state.claimError ? { error: { message: 'down' } } : { data: state.claimed ?? true }
        return undefined
    })
}

const rpcArgs = (fn: string) => db.callsTo('callScalar', fn).map(call => call.args[0])

const { claimAuthEmailSend, ensureEmailAccount, lookupEmailForSignUp, MAX_AUTH_EMAILS_PER_ADDRESS, MAX_SIGN_UPS_PER_IP } = await import('./email-sign-up.service')

beforeEach(() => {
    db.reset()
    auth.inserted = []
    auth.insertAnswer = [{ id: 'user-1' }]
    auth.insertFails = false
})

describe('ensureEmailAccount', () => {
    it('creates an unverified account with no password for an address never seen', async () => {
        stored({})

        expect(await ensureEmailAccount(EMAIL, IP)).toEqual({ ok: true, created: true })

        expect(auth.inserted).toEqual([expect.objectContaining({ email: EMAIL, emailVerified: false, name: '' })])
        expect(rpcArgs('email_domain_is_blocked')).toEqual([{ p_email: EMAIL }])
        expect(rpcArgs('claim_email_sign_up')).toEqual([{ p_ip: IP, p_ip_max: MAX_SIGN_UPS_PER_IP, p_window_seconds: 3600 }])
    })

    it('leaves an existing account alone, and counts nothing against the caller', async () => {
        stored({ exists: true })

        expect(await ensureEmailAccount(EMAIL, IP)).toEqual({ ok: true, created: false })

        expect(auth.inserted).toEqual([])
        expect(rpcArgs('claim_email_sign_up')).toEqual([])
    })

    it('refuses an address on a blocked domain before it counts or creates anything', async () => {
        stored({ blocked: true })

        expect(await ensureEmailAccount('someone@edu.catchall.example', IP)).toEqual({ ok: false, error: 'blocked_domain' })

        expect(rpcArgs('email_domain_is_blocked')).toEqual([{ p_email: 'someone@edu.catchall.example' }])
        expect(rpcArgs('claim_email_sign_up')).toEqual([])
        expect(auth.inserted).toEqual([])
    })

    it('holds back a caller who has opened too many accounts', async () => {
        stored({ claimed: false })

        expect(await ensureEmailAccount(EMAIL, IP)).toEqual({ ok: false, error: 'too_many' })
        expect(auth.inserted).toEqual([])
    })

    it('counts an IPv6 caller by its /64', async () => {
        stored({})

        await ensureEmailAccount(EMAIL, '2001:db8:1:2:3:4:5:6')

        expect(rpcArgs('claim_email_sign_up')).toEqual([expect.objectContaining({ p_ip: '2001:db8:1:2::/64' })])
    })

    it('takes an account created a moment earlier by another tab as there', async () => {
        stored({})
        auth.insertAnswer = []

        expect(await ensureEmailAccount(EMAIL, IP)).toEqual({ ok: true, created: false })
    })

    it('says unavailable when the account cannot be created', async () => {
        stored({})
        auth.insertFails = true
        vi.spyOn(console, 'error').mockImplementation(() => {})

        expect(await ensureEmailAccount(EMAIL, IP)).toEqual({ ok: false, error: 'unavailable' })
    })

    it('creates nothing when it cannot tell whether the address has an account', async () => {
        stored({ existsError: true })
        vi.spyOn(console, 'error').mockImplementation(() => {})

        expect(await ensureEmailAccount(EMAIL, IP)).toEqual({ ok: false, error: 'unavailable' })
        expect(auth.inserted).toEqual([])
    })
})

describe('lookupEmailForSignUp', () => {
    it('says an address has an account without looking at its domain', async () => {
        stored({ exists: true, blocked: true })

        expect(await lookupEmailForSignUp(EMAIL)).toEqual({ ok: true, exists: true })
        expect(rpcArgs('email_domain_is_blocked')).toEqual([])
    })

    it('lets a new address through once its domain is allowed, and counts nothing', async () => {
        stored({})

        expect(await lookupEmailForSignUp(EMAIL)).toEqual({ ok: true, exists: false })
        expect(rpcArgs('claim_email_sign_up')).toEqual([])
        expect(auth.inserted).toEqual([])
    })

    it('refuses a new address on a blocked domain', async () => {
        stored({ blocked: true })

        expect(await lookupEmailForSignUp('someone@edu.catchall.example')).toEqual({ ok: false, error: 'blocked_domain' })
    })

    it('says unavailable when the account cannot be looked up', async () => {
        stored({ existsError: true })
        vi.spyOn(console, 'error').mockImplementation(() => {})

        expect(await lookupEmailForSignUp(EMAIL)).toEqual({ ok: false, error: 'unavailable' })
    })
})

describe('claimAuthEmailSend', () => {
    it('counts every email under its address, in the window of the sign-ups', async () => {
        stored({})

        expect(await claimAuthEmailSend(EMAIL)).toBe(true)
        expect(rpcArgs('claim_email_sign_up')).toEqual([{ p_ip: `mail:${EMAIL}`, p_ip_max: MAX_AUTH_EMAILS_PER_ADDRESS, p_window_seconds: 3600 }])
    })

    it('holds back an address that was mailed too often', async () => {
        stored({ claimed: false })

        expect(await claimAuthEmailSend(EMAIL)).toBe(false)
    })

    it('lets the email through when the counter cannot be read', async () => {
        stored({ claimError: true })
        vi.spyOn(console, 'error').mockImplementation(() => {})

        expect(await claimAuthEmailSend(EMAIL)).toBe(true)
    })
})
