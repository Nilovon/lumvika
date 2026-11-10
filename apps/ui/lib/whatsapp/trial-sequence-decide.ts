// Which WhatsApp a trial owner gets today, if any: one a day at most, at the hour they signed up,
// each picked by what they did. Pure, so every rule of the sequence is read and tested here.

const HOUR_MS = 60 * 60_000
const DAY_MS = 24 * HOUR_MS

// The first job has had time to finish, and the evening of the signup is still the same day.
const DAY_ZERO_DELAY_MS = 3 * HOUR_MS
// A slot missed by more than this is dropped: a late deploy or a stalled cron sends nothing stale.
const SLOT_WINDOW_MS = 6 * HOUR_MS
// Any other WhatsApp to the same person this recently takes the day's place, the access-ending and
// payment notices included.
const DAILY_CAP_MS = 20 * HOUR_MS
// "9 jobs done" carries the recap, "1 jobs done" reads as an accusation.
const RECAP_MIN_TASKS = 2

export type TrialMessageKey =
    | 'trial_first_job_done'
    | 'trial_morning_report'
    | 'trial_no_first_job'
    | 'trial_idea_for_you'
    | 'trial_anything_blocking'
    | 'trial_needs_your_ok'
    | 'trial_week_recap'

export type TrialRun = { at: Date; scheduled: boolean }

export type TrialSignals = {
    cancelled: boolean
    repliedAt: Date | null
    lastWhatsAppAt: Date | null
    askedForOk: boolean
    recapSent: boolean
    // Runs a coworker finished successfully since the trial started, whoever started them.
    doneRuns: TrialRun[]
    // Every run started by the person typing to a coworker, whatever its outcome: what "they came
    // back" means here.
    chats: Date[]
    hasSchedule: boolean
    waitingOnThem: boolean
}

// The first days count from the start of the trial, the recap from its end: a trial the Getting
// Started reward extended has its last day later than day 4, and says nothing in between.
export type TrialSlot = { day: number; startedAt: Date; lastDay: number }
export type TrialPick = { key: TrialMessageKey; day: number } | { skip: string }

function slotAt(start: Date, day: number): number {
    return start.getTime() + (day === 0 ? DAY_ZERO_DELAY_MS : day * DAY_MS)
}

// The trial day whose slot is open right now, or null between two slots.
export function openTrialSlot(startedAt: Date, endsAt: Date, now: Date): TrialSlot | null {
    const day = Math.floor((now.getTime() - startedAt.getTime()) / DAY_MS)
    const lastDay = Math.round((endsAt.getTime() - startedAt.getTime()) / DAY_MS) - 1
    if (day < 0 || day > lastDay) return null
    const opensAt = slotAt(startedAt, day)
    if (now.getTime() < opensAt || now.getTime() >= opensAt + SLOT_WINDOW_MS) return null
    return { day, startedAt, lastDay }
}

function dayStart(start: Date, day: number): number {
    return start.getTime() + day * DAY_MS
}

function plannedMessage(signals: TrialSignals, slot: TrialSlot): TrialMessageKey | null {
    const chattedSince = (from: number) => signals.chats.some(at => at.getTime() >= from)

    if (slot.day === slot.lastDay) return signals.doneRuns.length >= RECAP_MIN_TASKS && !signals.recapSent ? 'trial_week_recap' : null

    switch (slot.day) {
        case 0:
            return signals.doneRuns.length > 0 && !signals.hasSchedule ? 'trial_first_job_done' : null
        case 1:
            if (signals.doneRuns.some(run => run.scheduled)) return 'trial_morning_report'
            return signals.doneRuns.length === 0 ? 'trial_no_first_job' : null
        case 2: {
            const workedOnDayZero = signals.doneRuns.some(run => run.at.getTime() < dayStart(slot.startedAt, 1))
            return workedOnDayZero && !chattedSince(dayStart(slot.startedAt, 1)) ? 'trial_idea_for_you' : null
        }
        case 3:
            return chattedSince(dayStart(slot.startedAt, 2)) ? null : 'trial_anything_blocking'
        default:
            return null
    }
}

export function pickTrialMessage(signals: TrialSignals, slot: TrialSlot, now: Date): TrialPick {
    if (signals.repliedAt && signals.repliedAt >= slot.startedAt) return { skip: 'replied' }
    if (signals.lastWhatsAppAt && now.getTime() - signals.lastWhatsAppAt.getTime() < DAILY_CAP_MS) return { skip: 'daily_cap' }
    // The access-ending sweep already writes to a cancelled trial on its last day.
    if (slot.day === slot.lastDay && signals.cancelled) return { skip: 'access_ending' }

    if (signals.waitingOnThem && !signals.askedForOk) return { key: 'trial_needs_your_ok', day: slot.day }

    const key = plannedMessage(signals, slot)
    return key ? { key, day: slot.day } : { skip: 'nothing_to_say' }
}
