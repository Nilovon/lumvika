import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ providerAccountsOf: vi.fn(), unlinked: [] as unknown[], getAuthUser: vi.fn(), anonymizeAccount: vi.fn(), accountDeletionBlockers: vi.fn() }))

vi.mock('@/lib/auth/session/getServerSession', () => ({ getAuthUser: mocks.getAuthUser }))
vi.mock('@/lib/auth/auth', () => ({ getAuth: vi.fn() }))
vi.mock('@/lib/auth/provider-email', () => ({ providerAccountsOf: mocks.providerAccountsOf }))
vi.mock('@/lib/db', async importOriginal => ({
    ...(await importOriginal<object>()),
    serviceScope: () => ({ kind: 'service', userId: null, run: (work: (executor: unknown) => Promise<unknown>) => work({ delete: () => ({ where: async () => mocks.unlinked.push('account') }) }) }),
}))
vi.mock('@/lib/images/upload', () => ({ uploadPublicImage: vi.fn() }))
vi.mock('@lumvika/cloud/billing.server', () => ({ syncStripeCustomerEmail: vi.fn() }))
vi.mock('@/app/api/_services/account-deletion.service', () => ({ anonymizeAccount: mocks.anonymizeAccount, accountDeletionBlockers: mocks.accountDeletionBlockers }))

const { deleteMyAccountAction, disconnectProviderAction, getAccountDeletionStatusAction, getSignInMethodsAction } = await import('./account.actions')

const ACCOUNT = { id: 'user-1', email: 'ada@lumvika.com', name: 'Ada', image: null, isAnonymous: false }

beforeEach(() => {
    vi.clearAllMocks()
    mocks.getAuthUser.mockResolvedValue(ACCOUNT)
    mocks.anonymizeAccount.mockResolvedValue({ ok: true })
    mocks.accountDeletionBlockers.mockResolvedValue([])
    mocks.providerAccountsOf.mockResolvedValue([{ id: 'acc-1', providerId: 'google', email: 'ada@gmail.com' }])
    mocks.unlinked = []
})

describe('deleteMyAccountAction', () => {
    it('refuses an anonymous visitor', async () => {
        mocks.getAuthUser.mockResolvedValue({ id: 'anon', email: null, name: 'Anonymous', image: null, isAnonymous: true })

        await expect(deleteMyAccountAction({ confirmation: 'DELETE' })).resolves.toMatchObject({ ok: false })
        expect(mocks.anonymizeAccount).not.toHaveBeenCalled()
    })

    it('deletes nothing without the typed confirmation', async () => {
        await expect(deleteMyAccountAction({ confirmation: 'delete' })).resolves.toEqual({ ok: false, error: 'Type DELETE to confirm.', code: 'typeToConfirm', params: { word: 'DELETE' } })
        expect(mocks.anonymizeAccount).not.toHaveBeenCalled()
    })

    it('anonymizes the signed-in account', async () => {
        await expect(deleteMyAccountAction({ confirmation: ' DELETE ' })).resolves.toEqual({ ok: true })
        expect(mocks.anonymizeAccount).toHaveBeenCalledWith(expect.objectContaining({ kind: 'service' }), ACCOUNT.id)
    })

    it('names the workspaces whose plan has to be cancelled first', async () => {
        mocks.anonymizeAccount.mockResolvedValue({ ok: false, blockers: [{ workspaceId: 2, name: 'Side project' }] })

        await expect(deleteMyAccountAction({ confirmation: 'DELETE' })).resolves.toEqual({ ok: false, error: 'Cancel the subscription of Side project first.', code: 'cancelSubscriptionsFirst', params: { names: 'Side project' } })
    })
})

describe('getAccountDeletionStatusAction', () => {
    it('answers the blockers of the signed-in account', async () => {
        mocks.accountDeletionBlockers.mockResolvedValue([{ workspaceId: 2, name: 'Side project' }])

        await expect(getAccountDeletionStatusAction()).resolves.toEqual({ ok: true, blockers: [{ workspaceId: 2, name: 'Side project' }] })
        expect(mocks.accountDeletionBlockers).toHaveBeenCalledWith(expect.anything(), ACCOUNT.id)
    })
})

describe('sign-in methods', () => {
    it('lists the providers linked, each with the address it vouched for', async () => {
        const result = await getSignInMethodsAction()

        expect(result).toEqual({ ok: true, methods: { email: ACCOUNT.email, oauth: { google: { email: 'ada@gmail.com', canDisconnect: true }, apple: null } } })
    })

    it('keeps the last way in of an account with no address of its own', async () => {
        mocks.getAuthUser.mockResolvedValue({ ...ACCOUNT, email: 'x@deleted.lumvika.com' })

        const listed = await getSignInMethodsAction()
        expect(listed.ok && listed.methods.oauth.google?.canDisconnect).toBe(false)

        await expect(disconnectProviderAction({ provider: 'google' })).resolves.toMatchObject({ ok: false, code: 'lastSignInMethod' })
        expect(mocks.unlinked).toEqual([])
    })

    it('disconnects a provider the account can do without', async () => {
        await expect(disconnectProviderAction({ provider: 'google' })).resolves.toEqual({ ok: true })
        expect(mocks.unlinked).toEqual(['account'])
    })

    it('refuses a provider that is not linked', async () => {
        await expect(disconnectProviderAction({ provider: 'apple' })).resolves.toMatchObject({ ok: false, code: 'disconnectProviderFailed' })
        expect(mocks.unlinked).toEqual([])
    })
})
