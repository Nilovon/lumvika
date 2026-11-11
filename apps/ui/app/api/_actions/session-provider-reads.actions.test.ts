import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fakeScope } from '@/test/db-fake'

const db = await vi.hoisted(async () => (await import('@/test/db-fake')).fakeDb())
const request = vi.hoisted(() => ({ scope: null as unknown }))

vi.mock('@/lib/db', async importOriginal => ({ ...(await importOriginal<object>()), ...db.helpers }))
vi.mock('@/lib/auth/session/request', () => ({ getRequestScope: async () => request.scope }))

const { isWorkspaceMemberAction, readMemberWorkspacesAction, readSessionUserAction, readWorkspaceAction, readWorkspaceRoleAction } = await import('./session-provider-reads.actions')

beforeEach(() => {
    db.reset()
    request.scope = fakeScope('user', 'u1')
})

describe('session provider reads', () => {
    it('reads the caller own row, as the caller', async () => {
        db.answer(call => (call.table === 'users' ? { data: { id: 'u1', workspace_id: 7 } } : undefined))

        await expect(readSessionUserAction()).resolves.toEqual({ id: 'u1', workspace_id: 7 })
        const [read] = db.callsTo('selectMaybeSingle', 'users')
        expect(read.scope).toMatchObject({ kind: 'user', userId: 'u1' })
        expect(read.args[1]).toEqual({ id: 'u1' })
    })

    it('reads nothing for a request with no session', async () => {
        request.scope = fakeScope('anon')

        await expect(readSessionUserAction()).resolves.toBeNull()
        await expect(isWorkspaceMemberAction(7)).resolves.toBe(false)
        await expect(readWorkspaceRoleAction(7)).resolves.toBeNull()
        await expect(readMemberWorkspacesAction()).resolves.toEqual({ ids: [], workspaces: [] })
        expect(db.calls).toEqual([])
    })

    it('refuses a workspace id that is not one, before any read', async () => {
        await expect(isWorkspaceMemberAction(-1)).resolves.toBe(false)
        await expect(readWorkspaceAction(Number.NaN)).resolves.toBeNull()
        await expect(readWorkspaceRoleAction('7' as never)).resolves.toBeNull()
        expect(db.calls).toEqual([])
    })

    it('checks a membership on the caller own id', async () => {
        db.answer(call => (call.table === 'workspace_members' ? { data: { workspace_id: 7 } } : undefined))

        await expect(isWorkspaceMemberAction(7)).resolves.toBe(true)
        expect(db.callsTo('selectMaybeSingle', 'workspace_members')[0].args[1]).toEqual({ user_id: 'u1', workspace_id: 7 })
    })

    it('reads the workspaces of every membership', async () => {
        db.answer(call => {
            if (call.table === 'workspace_members') return { data: [{ workspace_id: 7 }, { workspace_id: 9 }] }
            if (call.table === 'workspaces') return { data: [{ id: 7 }, { id: 9 }] }
            return undefined
        })

        await expect(readMemberWorkspacesAction()).resolves.toEqual({ ids: [7, 9], workspaces: [{ id: 7 }, { id: 9 }] })
        expect(db.callsTo('selectMany', 'workspaces')[0].args[1]).toEqual({ id: [7, 9] })
    })
})
