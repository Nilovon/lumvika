'use client'

import { listWorkspaceFilesAction, type FileEntry } from '@/app/api/_actions/workspace-file.actions'
import { sortFileEntries } from '@/components/files/sort-file-entries'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export type SharedFileRef = { path: string; name: string }

export const joinPath = (dir: string, name: string) => (dir ? `${dir}/${name}` : name)

export const parentPath = (path: string) => path.split('/').filter(Boolean).slice(0, -1).join('/')

export type SharedFilesTree = {
    entriesOf: (dir: string) => FileEntry[] | undefined
    expanded: ReadonlySet<string>
    toggle: (dir: string) => void
    expand: (dir: string) => void
    refresh: (dir: string) => Promise<void>
    // Every file listed so far, across the folders opened: what the page editor can cite.
    knownFiles: SharedFileRef[]
}

// The shared folder as the sidebar shows it: a tree loaded one folder at a time, when it is opened.
// The folder view in the main panel reads the same listing, so a rename shows up in both at once.
export function useSharedFilesTree(): SharedFilesTree {
    const [listings, setListings] = useState<Record<string, FileEntry[]>>({})
    const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())
    const requested = useRef(new Set<string>())

    const refresh = useCallback(async (dir: string) => {
        requested.current.add(dir)
        let entries: FileEntry[] = []
        try {
            entries = (await listWorkspaceFilesAction(dir)).entries
        } catch {
            entries = []
        }
        setListings(current => ({ ...current, [dir]: sortFileEntries(entries) }))
    }, [])

    const load = useCallback(
        (dir: string) => {
            if (requested.current.has(dir)) return
            void refresh(dir)
        },
        [refresh],
    )

    useEffect(() => {
        load('')
    }, [load])

    const expand = useCallback(
        (dir: string) => {
            const parts = dir.split('/').filter(Boolean)
            const chain = parts.map((_, index) => parts.slice(0, index + 1).join('/'))
            for (const path of ['', ...chain]) load(path)
            setExpanded(current => new Set([...current, ...chain]))
        },
        [load],
    )

    const toggle = useCallback(
        (dir: string) => {
            load(dir)
            setExpanded(current => {
                const next = new Set(current)
                if (next.has(dir)) next.delete(dir)
                else next.add(dir)
                return next
            })
        },
        [load],
    )

    const entriesOf = useCallback((dir: string) => listings[dir], [listings])

    const knownFiles = useMemo(
        () =>
            Object.entries(listings).flatMap(([dir, entries]) =>
                entries.filter(entry => entry.type !== 'dir').map(entry => ({ path: joinPath(dir, entry.name), name: entry.name })),
            ),
        [listings],
    )

    return { entriesOf, expanded, toggle, expand, refresh, knownFiles }
}
