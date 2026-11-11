import { selectMany, type DbScope } from '@/lib/db'

import type { CatalogEntry } from '@lumvika/ui/new-agent'

export type { CatalogEntry }

export type ServiceCatalog = Map<string, CatalogEntry>

export async function loadServiceCatalog(scope: DbScope, slugs?: string[]): Promise<ServiceCatalog> {
    const filters = slugs ? { enabled: true, slug: { in: slugs } } : { enabled: true }
    const { data } = await selectMany(scope, 'services', ['slug', 'name', 'icon', 'category'] as const, filters, { column: 'name' })

    return new Map((data ?? []).map(row => [row.slug, { slug: row.slug, name: row.name, icon: row.icon, category: row.category }]))
}
