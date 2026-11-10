// Whether a member uses every Box open to the workspace (`all`) or only the ones named to them.
export type BoxScope = 'all' | 'assigned'

export function toBoxScope(value: string | null | undefined): BoxScope {
    return value === 'assigned' ? 'assigned' : 'all'
}
