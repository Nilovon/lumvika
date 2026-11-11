import { logger, queue, schedules } from '@trigger.dev/sdk/v3'
import { SEARCH_CACHE_TTL_MS } from '@/lib/search/cache'
import { deleteRows, serviceScope } from '@/lib/db'

const purgeQueue = queue({ name: 'purge-web-search-cache', concurrencyLimit: 1 })

// A stale entry is never served and gets overwritten when its query comes back, so this only keeps
// the queries asked once from piling up.
export async function purgeWebSearchCache(): Promise<{ purged: number }> {
    const cutoff = new Date(Date.now() - SEARCH_CACHE_TTL_MS).toISOString()
    const { data, error } = await deleteRows(serviceScope(), 'web_search_cache', { fetched_at: { lt: cutoff } }, ['query_key'])
    if (error) throw new Error(error.message)

    const purged = data.length
    logger.log('web search cache purged', { purged, cutoff })
    return { purged }
}

export const purgeWebSearchCacheDaily = schedules.task({
    id: 'purge-web-search-cache-daily',
    cron: { pattern: '40 3 * * *', timezone: 'Europe/Paris' },
    queue: purgeQueue,
    maxDuration: 300,
    // Tomorrow's run is the retry.
    retry: { maxAttempts: 1 },
    run: async () => purgeWebSearchCache(),
})
