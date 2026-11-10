// Argument coercion for the MCP servers. A tool call arrives as whatever JSON the calling model
// decided to send, so every handler reads its arguments through these rather than trusting the
// shape. Errors are written for that model to read and correct itself.

export function requireString(v: unknown, field: string): string {
    if (typeof v !== 'string' || !v) throw new Error(`Missing required argument: ${field}`)
    return v
}

export function asString(v: unknown): string | undefined {
    return typeof v === 'string' && v ? v : undefined
}

export function asNumber(v: unknown): number | undefined {
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

export function asStringArray(v: unknown): string[] {
    return Array.isArray(v) ? v.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0) : []
}

export function asBooleanRecord(v: unknown): Record<string, boolean> | undefined {
    if (!v || typeof v !== 'object') return undefined
    const out: Record<string, boolean> = {}
    for (const [key, value] of Object.entries(v as Record<string, unknown>)) if (typeof value === 'boolean') out[key] = value
    return Object.keys(out).length > 0 ? out : undefined
}

export function clamp(value: number | undefined, fallback: number, max: number): number {
    if (value === undefined) return fallback
    return Math.min(Math.max(Math.trunc(value), 1), max)
}

export function requireConfirmation(args: Record<string, unknown>, what: string): void {
    if (args.confirm !== true) throw new Error(`This deletes ${what} for good. Call again with confirm: true once the account owner has agreed.`)
}

// Same reflex as requireConfirmation, for a call that gives something away rather than destroying
// it: sending the agent alone needs no ceremony, sending someone's memories out of the workspace
// does.
export function requireAgreement(args: Record<string, unknown>, what: string): void {
    if (args.confirm !== true) {
        throw new Error(`This sends ${what} out of the workspace, readable by anyone holding the link. Call again with confirm: true once the account owner has agreed.`)
    }
}
