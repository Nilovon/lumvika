// Local working-hour windows without a date library. Everything goes through Intl, which maps an
// absolute instant to exactly one wall clock through the tz database: no offset arithmetic of ours
// can drift across a DST transition, and half-hour zones (Asia/Kolkata) work for free.

export type LocalWindow = {
    startHour: number
    endHour: number
    /** 0 = Sunday .. 6 = Saturday */
    weekdays: readonly number[]
}

export type LocalParts = {
    year: number
    month: number
    day: number
    hour: number
    minute: number
    weekday: number
}

export const DEFAULT_WINDOW: LocalWindow = { startHour: 8, endHour: 18, weekdays: [1, 2, 3, 4, 5] }

export const MINUTE_MS = 60_000
export const DAY_MS = 86_400_000

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatterFor(timeZone: string): Intl.DateTimeFormat {
    let formatter = formatters.get(timeZone)
    if (!formatter) {
        formatter = new Intl.DateTimeFormat('en-US', {
            timeZone,
            // hourCycle rather than hour12: false, which renders midnight as "24" on some engines.
            hourCycle: 'h23',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        })
        formatters.set(timeZone, formatter)
    }
    return formatter
}

export function isValidTimeZone(timeZone: string): boolean {
    try {
        new Intl.DateTimeFormat('en-US', { timeZone })
        return true
    } catch {
        return false
    }
}

export function getLocalParts(date: Date, timeZone: string): LocalParts {
    const parts = formatterFor(timeZone).formatToParts(date)
    const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(part => part.type === type)?.value)
    const year = value('year')
    const month = value('month')
    const day = value('day')
    // Re-projecting the wall-clock date as UTC gives the local weekday without ever parsing a
    // locale-dependent weekday string.
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
    return { year, month, day, hour: value('hour'), minute: value('minute'), weekday }
}

export function isInLocalWindow(date: Date, timeZone: string, window: LocalWindow): boolean {
    const parts = getLocalParts(date, timeZone)
    if (!window.weekdays.includes(parts.weekday)) return false
    const minutes = parts.hour * 60 + parts.minute
    return minutes >= window.startHour * 60 && minutes < window.endHour * 60
}

function offsetMsAt(date: Date, timeZone: string): number {
    const parts = getLocalParts(date, timeZone)
    return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) - Math.floor(date.getTime() / MINUTE_MS) * MINUTE_MS
}

/**
 * Earliest instant whose wall clock in `timeZone` is at or after the given local time. The offset
 * is a fixpoint (an offset depends on the instant, which depends on the offset), and a spring
 * forward can make the requested wall time not exist at all, which the final correction absorbs.
 */
export function zonedWallTimeToInstant(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): Date {
    const target = Date.UTC(year, month - 1, day, hour, minute)
    let guess = new Date(target - offsetMsAt(new Date(target), timeZone))
    guess = new Date(target - offsetMsAt(guess, timeZone))

    const back = getLocalParts(guess, timeZone)
    const backMs = Date.UTC(back.year, back.month - 1, back.day, back.hour, back.minute)
    return backMs < target ? new Date(guess.getTime() + (target - backMs)) : guess
}

/**
 * First instant at or after `from` that falls inside the expert's local window, or null when the
 * window itself is empty. Candidates are re-checked with isInLocalWindow, so a zone that defeats
 * the offset fixpoint degrades into skipping a day rather than into a send outside working hours.
 */
export function nextEligibleAt(from: Date, timeZone: string, window: LocalWindow): Date | null {
    if (window.weekdays.length === 0 || window.startHour >= window.endHour) return null
    if (isInLocalWindow(from, timeZone, window)) return from

    // Eight days covers any weekday subset: the largest gap between two allowed days is seven.
    for (let dayOffset = 0; dayOffset <= 8; dayOffset++) {
        const parts = getLocalParts(new Date(from.getTime() + dayOffset * DAY_MS), timeZone)
        if (!window.weekdays.includes(parts.weekday)) continue

        const candidate = zonedWallTimeToInstant(parts.year, parts.month, parts.day, window.startHour, 0, timeZone)
        if (candidate.getTime() < from.getTime()) continue
        if (isInLocalWindow(candidate, timeZone, window)) return candidate
    }
    return null
}

/** Last instant of the expert's local window on the day `date` falls in, or null when outside it. */
export function localWindowCloseAt(date: Date, timeZone: string, window: LocalWindow): Date | null {
    if (!isInLocalWindow(date, timeZone, window)) return null
    const parts = getLocalParts(date, timeZone)
    return zonedWallTimeToInstant(parts.year, parts.month, parts.day, window.endHour, 0, timeZone)
}

/** Calendar day key in the throttle reference zone, e.g. "2026-07-28". */
export function capDayKey(date: Date, capTimeZone: string): string {
    const { year, month, day } = getLocalParts(date, capTimeZone)
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function startOfNextCapDay(date: Date, capTimeZone: string): Date {
    const { year, month, day } = getLocalParts(date, capTimeZone)
    const nextDay = getLocalParts(new Date(zonedWallTimeToInstant(year, month, day, 12, 0, capTimeZone).getTime() + DAY_MS), capTimeZone)
    return zonedWallTimeToInstant(nextDay.year, nextDay.month, nextDay.day, 0, 0, capTimeZone)
}
