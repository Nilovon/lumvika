export type KitTocEntry = { id: string; label: string }

export function KitToc({ entries }: { entries: KitTocEntry[] }) {
    return (
        <nav aria-label="Sections" className="flex flex-wrap gap-x-4 gap-y-2 border-y border-divide py-4">
            {entries.map((entry, index) => (
                <a key={entry.id} href={`#${entry.id}`} className="font-mono text-xs text-foreground/40 transition-colors hover:text-foreground">
                    <span className="text-foreground/25">{String(index + 1).padStart(2, '0')}</span> {entry.label}
                </a>
            ))}
        </nav>
    )
}
