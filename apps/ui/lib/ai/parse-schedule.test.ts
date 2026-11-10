import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('ai', () => ({ generateText: vi.fn() }))
vi.mock('@/lib/ai/openrouter', () => ({ openrouter: (model: string) => ({ model }) }))

import { generateText } from 'ai'
import { parseSchedule } from './parse-schedule'

const CTX = { nowIso: '2026-09-30T10:00:00Z', timezone: 'Europe/Paris' }

function modelAnswers(text: string) {
    vi.mocked(generateText).mockResolvedValue({ text } as Awaited<ReturnType<typeof generateText>>)
}

beforeEach(() => {
    vi.mocked(generateText).mockReset()
})

describe('parseSchedule', () => {
    it('hands the description, the current time and the timezone to the model', async () => {
        modelAnswers('{}')
        await parseSchedule('every weekday at 8am', CTX)
        const { prompt } = vi.mocked(generateText).mock.calls[0][0] as { prompt: string }
        expect(prompt).toContain('"every weekday at 8am"')
        expect(prompt).toContain(CTX.nowIso)
        expect(prompt).toContain(CTX.timezone)
    })

    it('reads a cron schedule wrapped in prose or a code fence', async () => {
        modelAnswers('Sure!\n```json\n{ "mode": "cron", "cron": " 0 8 * * 1-5 ", "label": " Weekdays at 8 " }\n```')
        expect(await parseSchedule('weekdays at 8', CTX)).toEqual({ mode: 'cron', cron: '0 8 * * 1-5', timezone: undefined, label: 'Weekdays at 8' })
    })

    it('labels a schedule with its expression when the model gave no label', async () => {
        modelAnswers('{ "mode": "cron", "cron": "0 9 * * *", "label": "  ", "timezone": " America/New_York " }')
        expect(await parseSchedule('daily', CTX)).toEqual({ mode: 'cron', cron: '0 9 * * *', timezone: 'America/New_York', label: '0 9 * * *' })
    })

    it('refuses a missing or invalid cron expression', async () => {
        modelAnswers('{ "mode": "cron", "label": "x" }')
        expect(await parseSchedule('x', CTX)).toBeNull()
        modelAnswers('{ "mode": "cron", "cron": "every day", "label": "x" }')
        expect(await parseSchedule('x', CTX)).toBeNull()
        modelAnswers('{ "mode": "cron", "cron": "61 8 * * *", "label": "x" }')
        expect(await parseSchedule('x', CTX)).toBeNull()
    })

    it('reads a one-shot run and refuses a date that does not parse', async () => {
        modelAnswers('{ "mode": "runAt", "runAt": "2026-10-01T15:00:00+02:00", "label": "Demain à 15h" }')
        expect(await parseSchedule('demain à 15h', CTX)).toEqual({ mode: 'runAt', runAt: '2026-10-01T15:00:00+02:00', timezone: undefined, label: 'Demain à 15h' })
        modelAnswers('{ "mode": "runAt", "runAt": "tomorrow", "label": "x" }')
        expect(await parseSchedule('x', CTX)).toBeNull()
        modelAnswers('{ "mode": "runAt", "runAt": 1700000000 }')
        expect(await parseSchedule('x', CTX)).toBeNull()
    })

    it('ignores the cron of a one-shot answer', async () => {
        modelAnswers('{ "mode": "runAt", "runAt": "2026-10-01T15:00:00Z", "cron": "0 8 * * *" }')
        expect(await parseSchedule('x', CTX)).toEqual({ mode: 'runAt', runAt: '2026-10-01T15:00:00Z', timezone: undefined, label: '2026-10-01T15:00:00Z' })
    })

    it('returns null on an unknown mode, no JSON, broken JSON or a failed call', async () => {
        modelAnswers('{ "mode": "weekly", "cron": "0 8 * * 1" }')
        expect(await parseSchedule('x', CTX)).toBeNull()
        modelAnswers('I cannot help with that')
        expect(await parseSchedule('x', CTX)).toBeNull()
        modelAnswers('{ "mode": "cron", ')
        expect(await parseSchedule('x', CTX)).toBeNull()
        vi.mocked(generateText).mockRejectedValue(new Error('overloaded'))
        expect(await parseSchedule('x', CTX)).toBeNull()
    })
})
