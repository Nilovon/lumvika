import { MAX_APPS_AT_CREATION } from './reading'

// The apps the new agent starts with: those of the suggestion it was picked from, those read in the
// description, then those added by hand. One taken off by hand stays off, whatever a later reading
// finds again.
export type AppSelection = { added: string[]; removed: string[] }

export const NO_APP_SELECTION: AppSelection = { added: [], removed: [] }

export function selectedApps(suggested: string[], read: string[], selection: AppSelection): string[] {
    const all = [...new Set([...suggested, ...read, ...selection.added])]
    return all.filter(slug => !selection.removed.includes(slug)).slice(0, MAX_APPS_AT_CREATION)
}

export function toggleApp(selection: AppSelection, slug: string, selected: boolean): AppSelection {
    if (selected) return { added: selection.added.filter(app => app !== slug), removed: [...selection.removed, slug] }
    return { added: [...selection.added, slug], removed: selection.removed.filter(app => app !== slug) }
}

// The suggestion a typed description is closest to: the one sharing the most apps with it, if any.
export function closestSuggestion<T extends { apps: string[] }>(apps: string[], suggestions: T[]): T | null {
    let best: T | null = null
    let score = 0
    for (const suggestion of suggestions) {
        const shared = suggestion.apps.filter(app => apps.includes(app)).length
        if (shared > score) [best, score] = [suggestion, shared]
    }
    return best
}
