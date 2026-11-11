import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fakeScope, type DbAnswer } from '@/test/db-fake'

const db = await vi.hoisted(async () => (await import('@/test/db-fake')).fakeDb())
vi.mock('@/lib/db', async importOriginal => ({ ...(await importOriginal<object>()), ...db.helpers }))

vi.mock('./send', () => ({ deliverWhatsApp: vi.fn() }))
vi.mock('@/lib/notifications/recipient', () => ({ loadFirstName: vi.fn(async () => 'Lucien') }))
vi.mock('@/lib/og/board-image', () => ({ boardImageUrl: vi.fn((scene: unknown) => `https://app.lumvika.com/og/board?scene=${JSON.stringify(scene)}`) }))

const { sweepAccessEnding } = await import('./access-ending')
const { deliverWhatsApp } = await import('./send')

type Tables = { workspaces?: DbAnswer; workspace_members?: DbAnswer; agents?: DbAnswer; notifications?: DbAnswer }

const NOW = new Date('2026-10-09T10:00:00.000Z')
const ENDS_AT = '2026-10-10T09:30:00+00:00'

function database(overrides: Tables = {}) {
    const tables: Tables = {
        workspaces: { data: [{ id: 7, subscription_cancel_at: ENDS_AT }] },
        workspace_members: { data: [{ user_id: 'owner' }] },
        agents: { data: [{ id: 'a1', name: 'Lead Scout' }, { id: 'a2', name: 'Inbox Assistant' }] },
        notifications: { data: 14 },
        ...overrides,
    }
    db.reset()
    db.answer(call => tables[call.table as keyof Tables])
    return fakeScope()
}

const delivered = () => vi.mocked(deliverWhatsApp).mock.calls[0][1]

describe('sweepAccessEnding', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(deliverWhatsApp).mockResolvedValue({ sent: true, id: 'row-1' })
    })

    it('reads the subscriptions ending within a day, sandboxes left out', async () => {
        await sweepAccessEnding(database(), NOW)

        expect(db.callsTo('selectMany', 'workspaces')[0].args[1]).toMatchObject({
            subscription_cancel_at: { gte: NOW.toISOString(), lte: '2026-10-10T10:00:00.000Z' },
            is_sandbox: false,
        })
    })

    it('sends the owner what the team got done, once per end date', async () => {
        const report = await sweepAccessEnding(database(), NOW)

        expect(report).toEqual({ considered: 1, sent: [7], skipped: [] })
        expect(delivered()).toMatchObject({ userId: 'owner', workspaceId: 7, language: 'en', dedupeKey: `access_ends:7:${ENDS_AT}` })
        expect(delivered().message).toMatchObject({
            slug: 'lumvika_access_ends_coworker',
            components: [
                { type: 'header', parameters: [{ type: 'image', url: expect.stringContaining('"name":"Lead Scout","status":"working"') }] },
                {
                    type: 'body',
                    parameters: [
                        { type: 'text', name: 'first_name', text: 'Lucien' },
                        { type: 'text', name: 'task_count', text: '14' },
                    ],
                },
                { type: 'button', parameters: [{ type: 'text', text: '?billing=1&ref=whatsapp&wa=access_ends_recap' }] },
            ],
        })
    })

    it('offers a first job, on a board of switched-off coworkers, to a team that did next to nothing', async () => {
        await sweepAccessEnding(database({ notifications: { data: 1 } }), NOW)

        const { message } = delivered()
        expect(message.slug).toBe('lumvika_access_ends_help')
        const [header] = message.components
        expect(header.parameters[0]).toMatchObject({ type: 'image', url: expect.stringContaining('"name":"Lead Scout","status":"offline"') })
    })

    it('has nothing to say to a workspace without a coworker', async () => {
        const report = await sweepAccessEnding(database({ agents: { data: [] } }), NOW)

        expect(deliverWhatsApp).not.toHaveBeenCalled()
        expect(report.skipped).toEqual(['7: no_coworker'])
    })

    it('reports a refusal, and keeps a message already sent out of the report', async () => {
        vi.mocked(deliverWhatsApp).mockResolvedValueOnce({ sent: false, reason: 'no_phone' })
        expect((await sweepAccessEnding(database(), NOW)).skipped).toEqual(['7: no_phone'])

        vi.mocked(deliverWhatsApp).mockResolvedValueOnce({ sent: false, reason: 'duplicate' })
        expect(await sweepAccessEnding(database(), NOW)).toEqual({ considered: 1, sent: [], skipped: [] })
    })

    it('carries on past a workspace that throws', async () => {
        vi.mocked(deliverWhatsApp).mockRejectedValueOnce(new Error('bird down'))

        const report = await sweepAccessEnding(database({ workspaces: { data: [{ id: 7, subscription_cancel_at: ENDS_AT }, { id: 8, subscription_cancel_at: ENDS_AT }] } }), NOW)

        expect(report).toEqual({ considered: 2, sent: [8], skipped: ['7: bird down'] })
    })
})
