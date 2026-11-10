import type { PartialResult } from './context.js'

export function partialResultsNote(results: PartialResult[]): string {
    const sections = results.map(r => `## ${r.label}\n${r.text}`)
    return `Run stopped by the user before the turn finished. Results already obtained by delegated tasks, kept so they are not redone:\n\n${sections.join('\n\n')}`
}
