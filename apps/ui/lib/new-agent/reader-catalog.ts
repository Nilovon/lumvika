import { loadServiceCatalog, type CatalogEntry } from '@/lib/templates/catalog'
import { getRequestScope } from '@/lib/auth/session/request'

// The catalogue rides in every prompt of the job reader, which reads the description at each pause
// in the typing: kept a few minutes per server instance rather than read again each time. The rows
// are the public catalogue, so a visitor without a session reads the same ones.
const CATALOG_TTL_MS = 5 * 60 * 1000
let cachedCatalog: { entries: CatalogEntry[]; at: number } | null = null

export async function readerCatalog(): Promise<CatalogEntry[]> {
    if (cachedCatalog && Date.now() - cachedCatalog.at < CATALOG_TTL_MS) return cachedCatalog.entries
    const entries = [...(await loadServiceCatalog(await getRequestScope())).values()]
    if (entries.length > 0) cachedCatalog = { entries, at: Date.now() }
    return entries
}
