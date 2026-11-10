export const HALF_LIFE_HOURS: Record<string, number> = {
    preference: 2160,
    fact: 1080,
    learned: 1080,
    note: 504,
    task: 72,
}

export const DEFAULT_HALF_LIFE_HOURS = 504
export const DORMANT_THRESHOLD = 0.15
export const ARCHIVE_THRESHOLD = 0.05

export type DecayInput = {
    kind: string
    createdAt: string
    lastAccessedAt: string | null
    accessCount: number
}

export function computeStrength(input: DecayInput, now = Date.now()): number {
    const base = HALF_LIFE_HOURS[input.kind] ?? DEFAULT_HALF_LIFE_HOURS
    const effectiveHalfLife = base * (1 + Math.log2(1 + input.accessCount))
    const anchor = Date.parse(input.lastAccessedAt ?? input.createdAt)
    if (Number.isNaN(anchor)) return 1
    const ageHours = Math.max(0, (now - anchor) / 3_600_000)
    return Math.pow(0.5, ageHours / effectiveHalfLife)
}

export function memoryStatus(strength: number): 'active' | 'dormant' {
    return strength < DORMANT_THRESHOLD ? 'dormant' : 'active'
}
