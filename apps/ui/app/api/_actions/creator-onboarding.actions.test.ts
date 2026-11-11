import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { DbCall } from '@/test/db-fake'

const mocks = vi.hoisted(() => ({ getServerSession: vi.fn(), enterSandbox: vi.fn(), captureServer: vi.fn() }))

const db = await vi.hoisted(async () => (await import('@/test/db-fake')).fakeDb())
vi.mock('@/lib/db', async importOriginal => ({ ...(await importOriginal<object>()), ...db.helpers }))
vi.mock('@/lib/auth/session/getServerSession', () => ({ getServerSession: mocks.getServerSession, getSessionWorkspace: mocks.getServerSession }))
vi.mock('@/app/api/_services/sandbox.service', () => ({ enterSandbox: mocks.enterSandbox }))
vi.mock('@lumvika/analytics/server', () => ({ captureServer: mocks.captureServer, deterministicUuid: (seed: string) => seed }))

const { claimCreatorSandboxAction } = await import('./creator-onboarding.actions')

type Row = Record<string, unknown>

const ME = 'user-me'

function tableResolver(rows: Record<string, Row[]>) {
    return (call: DbCall) => {
        if (call.helper !== 'selectMaybeSingle') return undefined
        const filters = call.args[1] as Row
        const matching = (rows[call.table] ?? []).filter(row => Object.entries(filters).every(([column, value]) => row[column] === value))
        return { data: matching[0] ?? null }
    }
}

function database(rows: Record<string, Row[]>) {
    db.answer(tableResolver(rows))
}

const writesTo = (table: string) => db.callsTo('updateRows', table).map(call => call.args)

function expert(overrides: Row = {}): Row {
    return { id: 'expert-1', slug: 'jane', email: 'jane@studio.test', status: 'accepted', application_status: 'approved', creator_token: 'tok', ...overrides }
}

beforeEach(() => {
    vi.clearAllMocks()
    db.reset()
    mocks.getServerSession.mockResolvedValue({ user: { id: ME }, session: { email: 'jane@studio.test' }, isAnonymous: false })
    mocks.enterSandbox.mockResolvedValue({ ok: true, workspaceId: 50 })
})

describe('claimCreatorSandboxAction', () => {
    it('refuses a creator profile already linked to another account', async () => {
        database({ experts: [expert()], users: [{ id: ME, expert_profile_id: null }, { id: 'user-other', expert_profile_id: 'expert-1' }] })

        await expect(claimCreatorSandboxAction('tok')).resolves.toEqual({ ok: false, error: 'This creator profile is already linked to another account.', code: 'creatorProfileTaken' })
        expect(writesTo('users')).toHaveLength(0)
        expect(mocks.enterSandbox).not.toHaveBeenCalled()
    })

    it('refuses an account already linked to a different creator profile', async () => {
        database({ experts: [expert(), expert({ id: 'expert-2', creator_token: 'other' })], users: [{ id: ME, expert_profile_id: 'expert-2' }] })

        await expect(claimCreatorSandboxAction('tok')).resolves.toEqual({ ok: false, error: 'This account is already linked to another creator profile.', code: 'accountHasOtherCreatorProfile' })
        expect(writesTo('users')).toHaveLength(0)
        expect(mocks.enterSandbox).not.toHaveBeenCalled()
    })

    it('refuses an invitation that was declined', async () => {
        database({ experts: [expert({ status: 'declined' })], users: [{ id: ME, expert_profile_id: null }] })

        await expect(claimCreatorSandboxAction('tok')).resolves.toEqual({ ok: false, error: 'This creator invitation is not open anymore.', code: 'creatorInviteClosed' })
        expect(mocks.enterSandbox).not.toHaveBeenCalled()
    })

    it('refuses an invitation whose application was rejected', async () => {
        database({ experts: [expert({ application_status: 'rejected' })], users: [{ id: ME, expert_profile_id: null }] })

        await expect(claimCreatorSandboxAction('tok')).resolves.toEqual({ ok: false, error: 'This creator invitation is not open anymore.', code: 'creatorInviteClosed' })
    })

    it('refuses an unknown token', async () => {
        database({ experts: [expert()], users: [{ id: ME, expert_profile_id: null }] })

        await expect(claimCreatorSandboxAction('forged')).resolves.toEqual({ ok: false, error: 'This link is no longer valid.', code: 'linkInvalid' })
    })

    it('refuses an account without a profile when no token is given', async () => {
        database({ users: [{ id: ME, expert_profile_id: null }] })

        await expect(claimCreatorSandboxAction()).resolves.toEqual({ ok: false, error: 'This account is not linked to a creator profile.', code: 'noCreatorProfile' })
    })

    it('links the profile to the caller, flags the account expert and opens the sandbox', async () => {
        database({ experts: [expert()], users: [{ id: ME, expert_profile_id: null }] })

        await expect(claimCreatorSandboxAction('tok')).resolves.toEqual({ ok: true, workspaceId: 50 })

        expect(writesTo('users')).toEqual([[{ account_role: 'expert', expert_profile_id: 'expert-1' }, { id: ME }]])
        expect(writesTo('experts')[0][0]).toEqual({ creator_joined_at: expect.any(String), updated_at: expect.any(String) })
        expect(mocks.enterSandbox).toHaveBeenCalledWith(ME)
    })

    it('reopens the sandbox without relinking a profile the caller already holds', async () => {
        database({ experts: [expert()], users: [{ id: ME, expert_profile_id: 'expert-1' }] })

        await expect(claimCreatorSandboxAction()).resolves.toEqual({ ok: true, workspaceId: 50 })
        expect(writesTo('users')).toHaveLength(0)
        expect(mocks.captureServer).not.toHaveBeenCalled()
    })

    it('refuses a forwarded link opened by an account with another email', async () => {
        mocks.getServerSession.mockResolvedValue({ user: { id: ME }, session: { email: 'someone@else.test' }, isAnonymous: false })
        database({ experts: [expert()], users: [{ id: ME, expert_profile_id: null }] })

        await expect(claimCreatorSandboxAction('tok')).resolves.toEqual({ ok: false, error: 'This invitation is for another email. Sign in with the invited address.', code: 'invitationOtherEmail' })
        expect(writesTo('users')).toHaveLength(0)
        expect(writesTo('experts')).toHaveLength(0)
        expect(mocks.enterSandbox).not.toHaveBeenCalled()
    })

    it('refuses to link a profile that has no email on file', async () => {
        database({ experts: [expert({ email: null })], users: [{ id: ME, expert_profile_id: null }] })

        await expect(claimCreatorSandboxAction('tok')).resolves.toEqual({ ok: false, error: 'This invitation is for another email. Sign in with the invited address.', code: 'invitationOtherEmail' })
        expect(writesTo('users')).toHaveLength(0)
    })

    it('matches the invited email whatever its case', async () => {
        mocks.getServerSession.mockResolvedValue({ user: { id: ME }, session: { email: 'Jane@Studio.TEST' }, isAnonymous: false })
        database({ experts: [expert()], users: [{ id: ME, expert_profile_id: null }] })

        await expect(claimCreatorSandboxAction('tok')).resolves.toEqual({ ok: true, workspaceId: 50 })
        expect(writesTo('users')).toHaveLength(1)
    })

    it('refuses an anonymous session without reading the invitation', async () => {
        mocks.getServerSession.mockResolvedValue({ user: { id: ME }, session: { email: null, isAnonymous: true }, isAnonymous: true })
        database({ experts: [expert()], users: [{ id: ME, expert_profile_id: null }] })

        await expect(claimCreatorSandboxAction('tok')).resolves.toEqual({ ok: false, error: 'Sign in with the invited email to claim your creator profile.', code: 'signInToClaimCreator' })
        expect(db.calls).toHaveLength(0)
        expect(mocks.enterSandbox).not.toHaveBeenCalled()
    })

    it('refuses a session without an email', async () => {
        mocks.getServerSession.mockResolvedValue({ user: { id: ME }, session: { email: undefined }, isAnonymous: false })
        database({ experts: [expert()], users: [{ id: ME, expert_profile_id: null }] })

        await expect(claimCreatorSandboxAction('tok')).resolves.toEqual({ ok: false, error: 'Sign in with the invited email to claim your creator profile.', code: 'signInToClaimCreator' })
        expect(mocks.enterSandbox).not.toHaveBeenCalled()
    })
})
