type SortableEntry = { name: string; type: string }

export function sortFileEntries<T extends SortableEntry>(entries: T[]): T[] {
    return [...entries].sort((a, b) => {
        if (a.type === 'dir' && b.type !== 'dir') return -1
        if (a.type !== 'dir' && b.type === 'dir') return 1
        return a.name.localeCompare(b.name)
    })
}
