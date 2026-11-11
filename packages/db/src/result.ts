// What a helper answers instead of throwing, in the shape the app already reads: `error.message`,
// and `error.code` holding the Postgres SQLSTATE (`23505` for a unique violation).
export type DbError = { message: string; code: string; details: string | null; hint: string | null }

export type DbResult<T> = { data: T; error: null } | { data: null; error: DbError }

export const NOT_ONE_ROW = 'NOT_ONE_ROW'

export function failure(cause: unknown): DbError {
    let current: unknown = cause
    const seen = new Set<unknown>()
    while (current && typeof current === 'object' && !seen.has(current)) {
        seen.add(current)
        const candidate = current as { code?: unknown; message?: unknown; detail?: unknown; hint?: unknown; cause?: unknown }
        if (typeof candidate.code === 'string' && (/^[0-9A-Z]{5}$/.test(candidate.code) || candidate.code === NOT_ONE_ROW)) {
            return {
                message: String(candidate.message ?? 'Database error'),
                code: candidate.code,
                details: typeof candidate.detail === 'string' ? candidate.detail : null,
                hint: typeof candidate.hint === 'string' ? candidate.hint : null,
            }
        }
        current = candidate.cause
    }
    return { message: cause instanceof Error ? cause.message : String(cause), code: 'UNKNOWN', details: null, hint: null }
}

export async function settle<T>(work: () => Promise<T>): Promise<DbResult<T>> {
    try {
        return { data: await work(), error: null }
    } catch (cause) {
        return { data: null, error: failure(cause) }
    }
}
