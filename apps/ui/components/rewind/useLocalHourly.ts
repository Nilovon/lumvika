'use client'

import { useMemo } from 'react'

import { localHourly } from '@/lib/rewind/format'

export function useLocalHourly(hourly: number[], weekStart: string): number[] {
    return useMemo(() => localHourly(hourly, -new Date(weekStart).getTimezoneOffset()), [hourly, weekStart])
}
