import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { WorkspaceContext } from '@/app/api/_auth/ownership'
import { fakeScope } from '@/test/db-fake'

const db = await vi.hoisted(async () => (await import('@/test/db-fake')).fakeDb())
vi.mock('@/lib/db', async importOriginal => ({ ...(await importOriginal<object>()), ...db.helpers }))
vi.mock('server-only', () => ({}))
vi.mock('@/app/api/_services/naming.service', () => ({ ensureWorkspaceNamed: vi.fn() }))

const { readAnswers, writeAnswers } = await import('./profile')

function context(): WorkspaceContext {
    return { userId: 'member-2', userEmail: null, authUser: {} as WorkspaceContext['authUser'], workspace: { id: 7 } as WorkspaceContext['workspace'], role: 'admin', boxScope: 'all', scope: fakeScope() }
}

beforeEach(() => db.reset())

describe('steward profile', () => {
    it('reads the answers of the workspace, whoever asks', async () => {
        db.answer(call => (call.table === 'workspace_onboarding' ? { data: { answers: { company_name: 'Acme' } } } : undefined))

        await expect(readAnswers(context())).resolves.toEqual({ company_name: 'Acme' })
        expect(db.calls.filter(call => call.table === 'users')).toEqual([])
        expect(db.callsTo('selectMaybeSingle', 'workspace_onboarding')[0].args[1]).toEqual({ workspace_id: 7 })
    })

    it('writes the answers on the workspace and leaves the person alone', async () => {
        await writeAnswers(context(), { company_name: 'Acme' }, false)

        expect(db.callsTo('upsertRows', 'workspace_onboarding').map(call => call.args[0])).toEqual([expect.objectContaining({ workspace_id: 7, answers: { company_name: 'Acme' } })])
        expect(db.calls.filter(call => call.table === 'workspaces' || call.table === 'users')).toEqual([])
    })

    it('stamps the workspace onboarded once, never over an earlier date', async () => {
        await writeAnswers(context(), {}, true)

        const [stamp] = db.callsTo('updateRows', 'workspaces')
        expect(stamp.args[0]).toEqual({ onboarded_at: expect.any(String) })
        expect(stamp.args[1]).toEqual({ id: 7, onboarded_at: { isNull: true } })
    })
})
