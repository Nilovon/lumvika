// Neutralise the `ilike` wildcards so the user's text matches literally (the value itself is
// safely parameterised by supabase-js, so filter metacharacters need no escaping here).
export function sanitizeIlike(q: string): string {
    return q.replace(/[%_]/g, ' ').trim()
}
