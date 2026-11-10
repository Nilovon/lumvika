// Agents name their tables in code style (`leads_queue`, `openDeals`); the sidebar shows them as words.
export function humanizeTableName(name: string): string {
    const words = name
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/[_\-.\s]+/g, ' ')
        .trim()
        .toLowerCase()
    return words ? words.charAt(0).toUpperCase() + words.slice(1) : name
}
