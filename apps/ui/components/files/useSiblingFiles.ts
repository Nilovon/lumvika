import { useMemo } from 'react'

import { sortFileEntries } from './sort-file-entries'

export type SiblingFiles = { index: number; total: number; previous: () => void; next: () => void }

export function useSiblingFiles({
    entries,
    openName,
    onOpen,
}: {
    entries: { name: string; type: string }[]
    openName: string | undefined
    onOpen: (name: string) => void
}): SiblingFiles | null {
    return useMemo(() => {
        if (!openName) return null
        const files = sortFileEntries(entries).filter(entry => entry.type !== 'dir')
        const index = files.findIndex(entry => entry.name === openName)
        if (index === -1 || files.length < 2) return null
        const total = files.length
        return {
            index,
            total,
            previous: () => onOpen(files[(index - 1 + total) % total].name),
            next: () => onOpen(files[(index + 1) % total].name),
        }
    }, [entries, openName, onOpen])
}
