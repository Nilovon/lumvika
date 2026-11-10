import type { TemplateConnector } from '@lumvika/contracts'
import type { Database } from '@/app/api/database.types'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadServiceCatalog } from './catalog'

// The template level connector list is never authored: it is the union of what the captured
// agents carry, denormalised with a name and an icon because the landing app has no read on
// `services`. Every write path goes through this so a removed agent never leaves an orphan
// connector on the public page.
export async function resolveAgentConnectors(
    supabase: SupabaseClient<Database>,
    agents: { connectorSlugs: string[] }[],
): Promise<{ connectors: TemplateConnector[]; warnings: string[] }> {
    const slugs = [...new Set(agents.flatMap(agent => agent.connectorSlugs))]
    if (slugs.length === 0) return { connectors: [], warnings: [] }

    const catalog = await loadServiceCatalog(supabase, slugs)
    // A slug comes from the agent's own registry, which is not constrained to our catalog, so
    // an unknown one is kept and only warned about: it would otherwise make an already
    // captured template unsaveable.
    const unknown = slugs.filter(slug => !catalog.has(slug))
    const warnings = unknown.length > 0 ? [`Not in the services catalog, so they will render without a name or icon: ${unknown.join(', ')}.`] : []

    const connectors = slugs.map(slug => {
        const entry = catalog.get(slug)
        return { slug, name: entry?.name ?? slug, icon: entry?.icon ?? null }
    })

    return { connectors, warnings }
}
