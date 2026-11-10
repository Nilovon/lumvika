import { TABLE_SOURCES_MAX_ROWS, emailVerdictStatus, paidDataSourceOfCall, type EmailVerdictStatus, type PaidSource, type TableSourcesRequest, type TableSourcesResult } from '@rerun/contracts'

type Row = Record<string, unknown>
type RequestCell = TableSourcesRequest['rows'][number][string]

const MAX_TEXT = 2000

export type CellSource = { source: PaidSource; at: string; href?: string; verdict?: EmailVerdictStatus }

export type RowSources = {
    /** Each source once, newest first. */
    sources: PaidSource[]
    cells: Record<string, CellSource>
}

function requestCell(value: unknown): RequestCell | undefined {
    if (value === null || typeof value === 'number' || typeof value === 'boolean') return value
    // A cut string could never match the value the provider returned, so a long one is left out.
    if (typeof value === 'string') return value.length <= MAX_TEXT ? value : undefined
    return undefined
}

// The rowid and the other engine-added keys are not data a provider could have returned.
const isDataColumn = (key: string) => !key.startsWith('__')

export function sourcesRequestRows(rows: readonly Row[]): TableSourcesRequest['rows'] {
    return rows.slice(0, TABLE_SOURCES_MAX_ROWS).map(row => {
        const cells: TableSourcesRequest['rows'][number] = {}
        for (const [key, value] of Object.entries(row)) {
            const cell = isDataColumn(key) ? requestCell(value) : undefined
            if (cell !== undefined) cells[key] = cell
        }
        return cells
    })
}

/** One entry per row asked about, in the same order, null for a row with no traced data. */
export function resolveTableSources(result: TableSourcesResult, asked: number): (RowSources | null)[] {
    const sourceOfCall = new Map<string, { source: PaidSource; at: string }>()
    for (const [id, call] of Object.entries(result.calls)) sourceOfCall.set(id, { source: paidDataSourceOfCall(call.capability, call.servedBy), at: call.at })

    return Array.from({ length: asked }, (_, index) => {
        const entry = result.rows[index]
        if (!entry) return null
        const sources = new Map<string, PaidSource>()
        for (const id of entry.sources) {
            const call = sourceOfCall.get(id)
            if (call && !sources.has(call.source.id)) sources.set(call.source.id, call.source)
        }
        const cells: Record<string, CellSource> = {}
        for (const [column, cell] of Object.entries(entry.cells)) {
            const call = sourceOfCall.get(cell.call)
            if (!call) continue
            cells[column] = { ...call, href: cell.href, verdict: cell.verdict ? emailVerdictStatus(cell.verdict) : undefined }
            if (!sources.has(call.source.id)) sources.set(call.source.id, call.source)
        }
        return sources.size ? { sources: [...sources.values()], cells } : null
    })
}

/** The Sources column only earns its place once a row on screen has one. */
export function showsSourcesColumn(rows: readonly Row[], sourcesOf: (row: Row) => RowSources | null): boolean {
    return rows.some(row => sourcesOf(row) !== null)
}
