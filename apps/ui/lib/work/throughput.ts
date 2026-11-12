export const THROUGHPUT_DAYS = 14

export type ThroughputDay = { day: string; created: number; completed: number }

// A calendar day of the reader's own time zone, the way a person counts "yesterday".
export function localDayKey(date: Date): string {
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${date.getFullYear()}-${month}-${day}`
}

// One bucket per day, oldest first and ending today, every day present even when nothing happened:
// a gap in the axis would read as a missing day rather than a quiet one.
export function throughputDays(created: readonly string[], completed: readonly string[], today: Date = new Date(), days: number = THROUGHPUT_DAYS): ThroughputDay[] {
    const buckets: ThroughputDay[] = []
    const index = new Map<string, ThroughputDay>()
    for (let offset = days - 1; offset >= 0; offset--) {
        const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset)
        const bucket = { day: localDayKey(date), created: 0, completed: 0 }
        buckets.push(bucket)
        index.set(bucket.day, bucket)
    }
    for (const at of created) {
        const bucket = index.get(localDayKey(new Date(at)))
        if (bucket) bucket.created++
    }
    for (const at of completed) {
        const bucket = index.get(localDayKey(new Date(at)))
        if (bucket) bucket.completed++
    }
    return buckets
}
