import type { WebSearchResult } from '@/lib/search/brave'
import { selectMaybeSingle, serviceScope, upsertRows } from '@/lib/db'

export const SEARCH_CACHE_TTL_MS = 24 * 60 * 60 * 1000

export function searchCacheKey(query: string): string {
    return query.trim().toLowerCase().replace(/\s+/g, ' ')
}

// A cache that cannot be read is a miss: the search then goes to the provider as if nothing was kept.
export async function readCachedSearch(key: string): Promise<WebSearchResult[] | null> {
    try {
        const since = new Date(Date.now() - SEARCH_CACHE_TTL_MS).toISOString()
        const { data, error } = await selectMaybeSingle(serviceScope(), 'web_search_cache', ['results'] as const, { query_key: key, fetched_at: { gte: since } })
        if (error) {
            console.error('[search] could not read the cache:', error.message)
            return null
        }
        return data ? (data.results as WebSearchResult[]) : null
    } catch (err) {
        console.error('[search] could not read the cache:', err instanceof Error ? err.message : err)
        return null
    }
}

export async function storeSearch(key: string, results: WebSearchResult[]): Promise<void> {
    try {
        const { error } = await upsertRows(serviceScope(), 'web_search_cache', { query_key: key, results, fetched_at: new Date().toISOString() }, { onConflict: ['query_key'] })
        if (error) console.error('[search] could not store the search:', error.message)
    } catch (err) {
        console.error('[search] could not store the search:', err instanceof Error ? err.message : err)
    }
}
