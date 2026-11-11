import { authAccounts } from '@lumvika/db/schema'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const state = vi.hoisted(() => ({
    accounts: [] as { id: string; providerId: string; idToken: string | null }[],
    owner: null as string | null,
    released: [] as unknown[],
    updateUser: vi.fn(),
}))

vi.mock('@/lib/auth/auth', () => ({ getAuth: () => ({ $context: Promise.resolve({ internalAdapter: { updateUser: state.updateUser } }) }) }))
vi.mock('@/lib/db', async importOriginal => ({
    ...(await importOriginal<object>()),
    findAuthUserIdByEmail: async () => state.owner,
    serviceScope: () => ({
        kind: 'service',
        userId: null,
        run: (work: (executor: unknown) => Promise<unknown>) =>
            work({
                select: () => ({ from: () => ({ where: () => ({ orderBy: async () => state.accounts }) }) }),
                delete: (table: unknown) => ({ where: async () => state.released.push(table) }),
            }),
    }),
}))

const { claimProviderEmail, emailInIdToken } = await import('./provider-email')

const token = (claims: object) => `header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`

beforeEach(() => {
    state.accounts = [{ id: 'acc-1', providerId: 'google', idToken: token({ email: 'Ada@Example.com' }) }]
    state.owner = null
    state.released = []
    state.updateUser.mockReset().mockResolvedValue({ id: 'visitor-1' })
})

describe('emailInIdToken', () => {
    it('reads the address the provider vouched for, normalized', () => {
        expect(emailInIdToken(token({ email: 'Ada@Example.com', email_verified: true }))).toBe('ada@example.com')
    })

    it('reads nothing off a malformed token or one with no address', () => {
        expect(emailInIdToken('not-a-token')).toBeNull()
        expect(emailInIdToken('a.%%%.c')).toBeNull()
        expect(emailInIdToken(token({ sub: '123' }))).toBeNull()
        expect(emailInIdToken(null)).toBeNull()
    })
})

describe('claimProviderEmail', () => {
    it('files the visitor under the provider address, through the update hook', async () => {
        await expect(claimProviderEmail('visitor-1')).resolves.toBe('claimed')

        expect(state.updateUser).toHaveBeenCalledWith('visitor-1', { email: 'ada@example.com' })
        expect(state.released).toEqual([])
    })

    it('hands the identity back when its address already has an account', async () => {
        state.owner = 'someone-else'

        await expect(claimProviderEmail('visitor-1')).resolves.toBe('taken')

        expect(state.updateUser).not.toHaveBeenCalled()
        expect(state.released).toEqual([authAccounts])
    })

    it('hands the identity back when the address cannot be claimed', async () => {
        state.updateUser.mockRejectedValue(new Error('This email domain is not accepted.'))
        vi.spyOn(console, 'error').mockImplementation(() => {})

        await expect(claimProviderEmail('visitor-1')).resolves.toBe('failed')
        expect(state.released).toEqual([authAccounts])
    })

    it('fails when the provider gave no address, or nothing was linked', async () => {
        state.accounts = [{ id: 'acc-1', providerId: 'apple', idToken: token({ sub: '1' }) }]
        await expect(claimProviderEmail('visitor-1')).resolves.toBe('failed')
        expect(state.released).toEqual([authAccounts])

        state.accounts = []
        await expect(claimProviderEmail('visitor-1')).resolves.toBe('failed')
    })
})
