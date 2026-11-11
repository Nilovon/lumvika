// Neutralise the `ilike` wildcards so the user's text matches literally (the value itself is
// sent as a query parameter, so nothing else needs escaping here).
export function sanitizeIlike(q: string): string {
    return q.replace(/[%_]/g, ' ').trim()
}
