import { beforeEach, describe, expect, it, vi } from 'vitest'

const ensureEmailAccount = vi.fn()
const claimEmailCodeAsk = vi.fn()
vi.mock('@/app/api/_services/email-sign-up.service', () => ({ ensureEmailAccount: (...args: unknown[]) => ensureEmailAccount(...args), claimEmailCodeAsk: (...args: unknown[]) => claimEmailCodeAsk(...args) }))
vi.mock('@/lib/auth/session/request', () => ({ getRequestAuth: async () => null, getRequestScope: async () => ({ kind: 'anon', userId: null, run: vi.fn() }), getRequestWorkspaceId: async () => null }))

const { POST } = await import('./route')

const segment = { params: Promise.resolve({}) }

function ask(email: string) {
    return POST(new Request('https://app.lumvika.com/api/v1/auth/email/code', { method: 'POST', body: JSON.stringify({ email }), headers: { 'x-forwarded-for': '203.0.113.7' } }), segment)
}

describe('POST /api/v1/auth/email/code', () => {
    beforeEach(() => {
        ensureEmailAccount.mockReset()
        ensureEmailAccount.mockResolvedValue({ ok: true, created: true })
        claimEmailCodeAsk.mockReset().mockResolvedValue(true)
    })

    it('opens the account of a new normalized address, then leaves the code to the auth server, without saying the address was new', async () => {
        expect(await (await ask('Ada@Example.com ')).json()).toEqual({ mailed: false })
        expect(ensureEmailAccount).toHaveBeenCalledWith('ada@example.com', '203.0.113.7')
        ensureEmailAccount.mockResolvedValue({ ok: true, created: false })
        expect(await (await ask('ada@example.com')).json()).toEqual({ mailed: false })
    })

    it('counts every ask against the caller, before reading anything about the address', async () => {
        claimEmailCodeAsk.mockResolvedValue(false)
        const res = await ask('ada@example.com')
        expect(res.status).toBe(429)
        expect(claimEmailCodeAsk).toHaveBeenCalledWith('203.0.113.7')
        expect(ensureEmailAccount).not.toHaveBeenCalled()
    })

    it('refuses a blocked domain with the message the web shows', async () => {
        ensureEmailAccount.mockResolvedValue({ ok: false, error: 'blocked_domain' })
        const res = await ask('ada@spam.example')
        expect(res.status).toBe(422)
        expect(await res.json()).toEqual({ reason: 'blocked_domain', error: 'This email domain is not accepted. Use another address.' })
    })

    it('answers 400 on something that is not an address', async () => {
        expect((await ask('not an email')).status).toBe(400)
    })
})
