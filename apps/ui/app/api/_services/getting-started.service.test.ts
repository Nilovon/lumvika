import { captureServer } from '@lumvika/analytics/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { GettingStartedItem } from '@/lib/onboarding/getting-started'
import { fakeScope, type DbAnswer } from '@/test/db-fake'
import { resolveWorkspaceOwner } from './workspace-owner.service'
import { extendTrial } from '@lumvika/cloud/billing.server'

const db = await vi.hoisted(async () => (await import('@/test/db-fake')).fakeDb())
vi.mock('@/lib/db', async importOriginal => ({ ...(await importOriginal<object>()), ...db.helpers }))
vi.mock('@/lib/engine/client', () => ({ listConnections: vi.fn(), listSchedules: vi.fn() }))
vi.mock('./workspace-engine.service', () => ({ authenticateEngineToken: vi.fn(), findWorkspaceEngine: vi.fn() }))
vi.mock('@lumvika/cloud/billing', async importOriginal => ({ ...(await importOriginal<object>()), ...(await import('@/test/cloud-fakes')).CLOUD_ENTITLEMENTS }))
vi.mock('@lumvika/cloud/billing.server', () => ({ extendTrial: vi.fn(), subscriptionHasCard: vi.fn() }))
vi.mock('./workspace-owner.service', () => ({ resolveWorkspaceOwner: vi.fn() }))
vi.mock('@lumvika/analytics/server', async importOriginal => ({ ...(await importOriginal<typeof import('@lumvika/analytics/server')>()), captureServer: vi.fn() }))

const { grantGettingStartedReward, markGettingStarted, reportGettingStartedSteps } = await import('./getting-started.service')

const WORKSPACE_ID = 42
const COMPLETE = new Set<GettingStartedItem>(['first_agent', 'ai_provider', 'invite', 'schedule', 'payment_method'])
const scope = fakeScope()

let workspace: { subscription_status: string | null; stripe_subscription_id: string | null } | null
let claim: DbAnswer
let unreported: { item: string; done_at: string }[]

const WRITES = new Set(['insertRows', 'updateRows', 'upsertRows', 'deleteRows'])

beforeEach(() => {
    vi.clearAllMocks()
    db.reset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    workspace = { subscription_status: 'trialing', stripe_subscription_id: 'sub_1' }
    claim = { data: [] }
    unreported = []
    db.answer(call => {
        if (call.table === 'workspaces') return { data: workspace }
        if (call.table === 'workspace_getting_started' && call.helper === 'insertRows') return claim
        if (call.table === 'workspace_getting_started' && call.helper === 'updateRows') return { data: unreported.splice(0) }
        return undefined
    })
    vi.mocked(extendTrial).mockResolvedValue(true as never)
    vi.mocked(resolveWorkspaceOwner).mockResolvedValue({ userId: 'user_1', email: 'owner@lumvika.test' })
})

function rewardWrites() {
    return db.calls.filter(call => call.table === 'workspace_getting_started' && WRITES.has(call.helper))
}

describe('grantGettingStartedReward', () => {
    it('does nothing once the reward is already claimed', async () => {
        await grantGettingStartedReward(scope, WORKSPACE_ID, new Set([...COMPLETE, 'reward']))
        expect(db.calls).toHaveLength(0)
    })

    it('does nothing while a step is missing', async () => {
        await grantGettingStartedReward(scope, WORKSPACE_ID, new Set<GettingStartedItem>(['first_agent', 'ai_provider', 'invite', 'schedule']))
        expect(db.calls).toHaveLength(0)
    })

            it.each([
        ['a paid workspace', { subscription_status: 'active', stripe_subscription_id: 'sub_1' }],
        ['a trial without a Stripe subscription', { subscription_status: 'trialing', stripe_subscription_id: null }],
    ])('claims nothing for %s', async (_label, row) => {
        workspace = row
        await grantGettingStartedReward(scope, WORKSPACE_ID, COMPLETE)
        expect(rewardWrites()).toEqual([])
        expect(extendTrial).not.toHaveBeenCalled()
    })

    it('extends nothing when another tab already holds the claim', async () => {
        claim = { error: { code: '23505', message: 'duplicate key' } }
        await grantGettingStartedReward(scope, WORKSPACE_ID, COMPLETE)
        expect(extendTrial).not.toHaveBeenCalled()
    })

    it('claims the reward before extending the trial and keeps the claim', async () => {
        await grantGettingStartedReward(scope, WORKSPACE_ID, COMPLETE)

        expect(rewardWrites().map(call => [call.helper, call.args[0]])).toEqual([['insertRows', { workspace_id: WORKSPACE_ID, item: 'reward' }]])
        expect(extendTrial).toHaveBeenCalledWith('sub_1', 3, 'getting-started-reward-ws-42')
        expect(captureServer).toHaveBeenCalledWith('owner@lumvika.test', 'trial_extended', { days: 3, source: 'getting_started' }, expect.objectContaining({ uuid: expect.any(String) }))
    })

            it('asks nothing of a workspace whose owner cannot be resolved', async () => {
        vi.mocked(resolveWorkspaceOwner).mockResolvedValue(null)
        await grantGettingStartedReward(scope, WORKSPACE_ID, COMPLETE)
        expect(extendTrial).toHaveBeenCalledWith('sub_1', 3, 'getting-started-reward-ws-42')
    })

    it('releases the claim when Stripe declines to extend', async () => {
        vi.mocked(extendTrial).mockResolvedValue(false as never)

        await grantGettingStartedReward(scope, WORKSPACE_ID, COMPLETE)

        const release = rewardWrites().find(call => call.helper === 'deleteRows')
        expect(release?.args[0]).toEqual({ workspace_id: WORKSPACE_ID, item: 'reward' })
        expect(captureServer).not.toHaveBeenCalled()
    })

    it('releases the claim when the extension throws', async () => {
        vi.mocked(extendTrial).mockRejectedValue(new Error('stripe down'))

        await expect(grantGettingStartedReward(scope, WORKSPACE_ID, COMPLETE)).resolves.toBeUndefined()

        expect(rewardWrites().map(call => call.helper)).toEqual(['insertRows', 'deleteRows'])
        expect(captureServer).not.toHaveBeenCalled()
    })

    it('keeps the claim when only the analytics capture fails', async () => {
        vi.mocked(captureServer).mockRejectedValue(new Error('posthog down'))

        await expect(grantGettingStartedReward(scope, WORKSPACE_ID, COMPLETE)).resolves.toBeUndefined()

        expect(rewardWrites().map(call => call.helper)).toEqual(['insertRows'])
    })
})

describe('reportGettingStartedSteps', () => {
    it('reports a step a trigger ticked, dated from when it was done', async () => {
        unreported = [{ item: 'first_agent', done_at: '2026-10-08T09:00:00.000Z' }]
        await reportGettingStartedSteps(scope, WORKSPACE_ID)

        expect(captureServer).toHaveBeenCalledTimes(1)
        expect(captureServer).toHaveBeenCalledWith('owner@lumvika.test', 'getting_started_step_completed', { step: 'first_agent' }, { uuid: expect.any(String), timestamp: new Date('2026-10-08T09:00:00.000Z') })
    })

    it('only claims the steps nobody reported yet', async () => {
        await reportGettingStartedSteps(scope, WORKSPACE_ID)

        const [claimed] = db.callsTo('updateRows', 'workspace_getting_started')
        expect(claimed.args[0]).toEqual({ reported_at: expect.any(String) })
        expect(claimed.args[1]).toMatchObject({ workspace_id: WORKSPACE_ID, reported_at: { isNull: true } })
    })

    it('reports nothing the second time around', async () => {
        unreported = [{ item: 'invite', done_at: '2026-10-08T09:00:00.000Z' }]
        await reportGettingStartedSteps(scope, WORKSPACE_ID)
        await reportGettingStartedSteps(scope, WORKSPACE_ID)

        expect(captureServer).toHaveBeenCalledTimes(1)
    })

    it('never fails its caller when analytics does', async () => {
        unreported = [{ item: 'schedule', done_at: '2026-10-08T09:00:00.000Z' }]
        vi.mocked(captureServer).mockRejectedValueOnce(new Error('posthog down'))

        await expect(reportGettingStartedSteps(scope, WORKSPACE_ID)).resolves.toBeUndefined()
    })
})

describe('markGettingStarted', () => {
    it('reports the step it just wrote', async () => {
        unreported = [{ item: 'payment_method', done_at: '2026-10-08T09:00:00.000Z' }]
        await markGettingStarted(scope, WORKSPACE_ID, ['payment_method'])

        expect(rewardWrites().map(call => call.helper)).toEqual(['upsertRows', 'updateRows'])
        expect(captureServer).toHaveBeenCalledWith('owner@lumvika.test', 'getting_started_step_completed', { step: 'payment_method' }, expect.anything())
    })
})
