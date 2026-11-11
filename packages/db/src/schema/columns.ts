import { customType } from 'drizzle-orm/pg-core'

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

// Postgres answers `2026-11-11 10:00:00.123456+00`; the app compares and sorts these as strings
// against `new Date().toISOString()`, so they come back in ISO 8601, microseconds kept.
export function toIsoTimestamp(value: string): string {
    const [date, rest = ''] = value.split(' ')
    if (!rest) return value
    return `${date}T${rest.replace(/([+-]\d{2})$/, '$1:00')}`
}

export const timestamptz = customType<{ data: string; driverData: string }>({
    dataType: () => 'timestamp with time zone',
    fromDriver: toIsoTimestamp,
})
