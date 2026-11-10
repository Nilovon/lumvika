import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { vi } from 'vitest'

process.env.RERUN_DATA_DIR = mkdtempSync(resolve(tmpdir(), 'rerun-notify-tool-'))
process.env.RERUN_API_KEY = ''

const state = vi.hoisted(() => ({
    sent: [] as unknown[],
    result: { delivered: true } as { delivered: boolean; reason?: string },
}))

vi.mock('../../runtime/notify.js', async importOriginal => ({
    ...(await importOriginal<typeof import('../../runtime/notify.js')>()),
    sendNotification: async (payload: unknown) => {
        state.sent.push(payload)
        return state.result
    },
}))

const { beforeEach, describe, expect, it } = await import('vitest')
const { notifyTools } = await import('./notify.js')

function notify(ctx: Record<string, unknown>, args: Record<string, unknown>) {
    const tool = notifyTools({ agent: { id: 'notifier' }, sessionId: 'sess-1', ...ctx } as any).notify_user as any
    return tool.execute(tool.inputSchema.parse(args), { toolCallId: 'c', messages: [] }) as Promise<string>
}

beforeEach(() => {
    state.sent.length = 0
    state.result = { delivered: true }
})

describe('notify_user', () => {
    it('sends an info notification tied to the agent, session and run', async () => {
        expect(await notify({ runId: 'run-9' }, { message: 'Look at the report', metadata: { url: 'https://x' } })).toBe('Notification sent to the user.')
        expect(state.sent).toEqual([{ kind: 'info', agentId: 'notifier', sessionId: 'sess-1', runId: 'run-9', message: 'Look at the report', metadata: { url: 'https://x' } }])
    })

    it('sends null for a missing run id and missing metadata', async () => {
        await notify({}, { message: 'hi' })
        expect(state.sent[0]).toMatchObject({ runId: null, metadata: null })
    })

    it('names the member who started the run, next to the metadata the agent passed', async () => {
        const author = { id: 'u1', name: 'Marie' }
        await notify({ author }, { message: 'Look', metadata: { url: 'https://x' } })
        await notify({ author }, { message: 'Look again' })
        expect(state.sent.map(n => (n as { metadata: unknown }).metadata)).toEqual([{ url: 'https://x', authorId: 'u1' }, { authorId: 'u1' }])
    })

    it('tells the model to carry on when the notification was not delivered', async () => {
        state.result = { delivered: false, reason: 'hub unreachable' }
        expect(await notify({}, { message: 'hi' })).toBe('Notification not delivered (hub unreachable). Continue without it.')
        state.result = { delivered: false }
        expect(await notify({}, { message: 'hi' })).toBe('Notification not delivered (unknown). Continue without it.')
    })

    it('refuses any kind but info and an oversized message', () => {
        const schema = (notifyTools({ agent: { id: 'n' } } as any).notify_user as any).inputSchema
        expect(schema.safeParse({ message: 'x', kind: 'question' }).success).toBe(false)
        expect(schema.safeParse({ message: 'x'.repeat(16_001) }).success).toBe(false)
        expect(schema.safeParse({ message: 'x'.repeat(16_000) }).success).toBe(true)
    })
})
