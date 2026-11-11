import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fakeScope } from '@/test/db-fake'

const counts = { source: 0, user: 0 }
let devices: { token: string }[] = []
let userLocale: string | null = null
const inserted: unknown[] = []
const revoked: string[][] = []
vi.mock('@/lib/db', async importOriginal => ({
    ...(await importOriginal<object>()),
    selectMaybeSingle: async (_scope: unknown, table: string) => ({ data: table === 'users' ? { locale: userLocale } : { locale: 'en' } }),
    selectCount: async (_scope: unknown, _table: string, filter: Record<string, unknown>) => ({ data: 'source_key' in filter ? counts.source : counts.user }),
    selectMany: async () => ({ data: devices }),
    insertRows: async (_scope: unknown, table: string, row: unknown) => {
        inserted.push({ table, row })
        return { data: [], error: null }
    },
    updateRows: async (_scope: unknown, _table: string, _patch: unknown, filters: { token: string[] }) => {
        revoked.push(filters.token)
        return { data: [], error: null }
    },
}))

const { pushNotification } = await import('./push.service')

const scope = fakeScope('service')

const context = (patch: object = {}) => ({
    workspaceId: 1,
    agentId: 'agent-1',
    agentName: 'Scout',
    conversationId: 'conv-1',
    sourceKey: 'question:agent-1',
    notification: { kind: 'question', message: 'Which list first?', event: 'agent.run.waiting' } as never,
    recipients: { 'user-1': 'mine' as const },
    members: [{ id: 'user-1', prefs: null }],
    ...patch,
})

const expo = vi.fn()

describe('pushNotification', () => {
    beforeEach(() => {
        counts.source = 0
        counts.user = 0
        devices = [{ token: 'ExponentPushToken[a]' }]
        userLocale = null
        inserted.length = 0
        revoked.length = 0
        expo.mockReset().mockResolvedValue(new Response(JSON.stringify({ data: [{ status: 'ok' }] })))
        vi.stubGlobal('fetch', expo)
    })

    it('rings every device of a recipient, with what the app needs to open the conversation, and counts it', async () => {
        await pushNotification(scope, context())
        const [, init] = expo.mock.calls[0]
        expect(JSON.parse(init.body)).toEqual([{ to: 'ExponentPushToken[a]', title: 'Scout', subtitle: 'Question', body: 'Which list first?', sound: 'default', data: { agentId: 'agent-1', conversationId: 'conv-1', kind: 'question' } }])
        expect(inserted).toEqual([{ table: 'notification_push_dispatches', row: { user_id: 'user-1', source_key: 'question:agent-1' } }])
    })

    it('writes in the language the recipient picked', async () => {
        userLocale = 'de'
        await pushNotification(scope, context())
        const [, init] = expo.mock.calls[0]
        expect(JSON.parse(init.body)[0].subtitle).toBe('Frage')
    })

    it('lands a finished run without a sound', async () => {
        await pushNotification(scope, context({ notification: { kind: 'done', message: 'Here is the list.', event: 'agent.message.completed' } }))
        const [, init] = expo.mock.calls[0]
        expect(JSON.parse(init.body)[0]).not.toHaveProperty('sound')
    })

    it('stays quiet past the cap, for someone whose scope says nothing, and for someone without a device', async () => {
        counts.source = 3
        await pushNotification(scope, context())
        counts.source = 0
        await pushNotification(scope, context({ members: [{ id: 'user-1', prefs: { version: 2, scope: 'nothing' } }] }))
        devices = []
        await pushNotification(scope, context())
        expect(expo).not.toHaveBeenCalled()
    })

    it('revokes a token Expo says is gone, and does not count a batch nobody received', async () => {
        expo.mockResolvedValue(new Response(JSON.stringify({ data: [{ status: 'error', details: { error: 'DeviceNotRegistered' } }] })))
        await pushNotification(scope, context())
        expect(revoked).toEqual([['ExponentPushToken[a]']])
        expect(inserted).toEqual([])
    })

    it('never throws when Expo is unreachable', async () => {
        expo.mockRejectedValue(new Error('offline'))
        await expect(pushNotification(scope, context())).resolves.toBeUndefined()
    })
})
