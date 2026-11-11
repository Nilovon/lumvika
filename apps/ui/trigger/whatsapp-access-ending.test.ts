import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sweepAccessEnding } from '@/lib/whatsapp/access-ending'
import { runContext } from '@/test/trigger-sdk'
import { whatsappAccessEndingSchedule, whatsappAccessEndingSweep } from './whatsapp-access-ending'

vi.mock('@trigger.dev/sdk/v3', async () => (await import('@/test/trigger-sdk')).triggerSdkMock())
vi.mock('@/lib/whatsapp/access-ending', () => ({ sweepAccessEnding: vi.fn() }))

const REPORT = { considered: 1, sent: [7], skipped: [] }

type Run = (payload: unknown, params: unknown) => Promise<unknown>
const runTask = (payload: unknown) => (whatsappAccessEndingSweep as unknown as { run: Run }).run(payload, runContext('PRODUCTION'))
const runSchedule = (env: Parameters<typeof runContext>[0]) => (whatsappAccessEndingSchedule as unknown as { run: Run }).run({}, runContext(env))

describe('whatsapp access ending', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.unstubAllEnvs()
        vi.mocked(sweepAccessEnding).mockResolvedValue(REPORT)
    })

    it('sweeps every workspace on schedule in production', async () => {
        expect(await runSchedule('PRODUCTION')).toEqual(REPORT)
        expect(vi.mocked(sweepAccessEnding).mock.calls[0][2]).toBeUndefined()
    })

    it('narrows a run by hand to the workspaces it is given', async () => {
        await runTask({ workspaceIds: [7] })
        expect(vi.mocked(sweepAccessEnding).mock.calls[0][2]).toEqual([7])
    })

    it('does nothing from a local session', async () => {
        expect(await runSchedule('DEVELOPMENT')).toBeNull()
        expect(sweepAccessEnding).not.toHaveBeenCalled()
    })

    it('needs a redirect number anywhere that is not production', async () => {
        vi.stubEnv('WHATSAPP_REDIRECT_TO', '')
        expect(await runSchedule('STAGING')).toBeNull()

        vi.stubEnv('WHATSAPP_REDIRECT_TO', '+32492000000')
        expect(await runSchedule('STAGING')).toEqual(REPORT)
    })
})
