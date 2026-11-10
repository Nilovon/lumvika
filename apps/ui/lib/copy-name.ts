const COPY_SUFFIX = ' copy'

// Duplicating something whose name already fills its cap still has to produce a valid one. Keep a
// whole-word base whenever there is one, then reserve the suffix inside the cap.
export function copyOf(name: string, limit: number): string {
    const available = limit - COPY_SUFFIX.length
    const trimmed = name.trim()
    if (trimmed.length <= available) return `${trimmed}${COPY_SUFFIX}`

    const cut = trimmed.slice(0, available).trimEnd()
    const lastSpace = cut.lastIndexOf(' ')
    const base = lastSpace > available / 2 ? cut.slice(0, lastSpace) : cut
    return `${base}${COPY_SUFFIX}`
}

// Agent names are free text with no column cap, so this one is about the board rather than the
// database: a tile has a fixed width, and a name that keeps growing by " copy" on every
// duplication stops being readable long before Postgres minds.
const AGENT_NAME_LIMIT = 60

// The single source of what a copy is called. The server names the real agent with it; the board
// shows it on the ghost tile before the copy exists, and the two must not disagree.
export function duplicateAgentName(name: string): string {
    return copyOf(name, AGENT_NAME_LIMIT)
}
