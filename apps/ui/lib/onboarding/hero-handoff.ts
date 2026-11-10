import { AGENT_NAME_MAX, MAX_APPS_AT_CREATION } from '@lumvika/ui/new-agent/reading'

// What the landing page's composer read in the visitor's prompt and sends along with it, in the
// query string: the agent's name, and the catalogue slugs of its apps. Both come from a URL anyone
// can write, so they are bounded here; a slug the catalogue does not carry is dropped at creation.
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/

type Query = { get: (key: string) => string | null }

export function readHeroAgentName(query: Query): string | null {
    return query.get('name')?.trim().slice(0, AGENT_NAME_MAX) || null
}

export function readHeroAgentApps(query: Query): string[] {
    const slugs = (query.get('apps') ?? '').split(',').map(slug => slug.trim()).filter(slug => SLUG.test(slug))
    return [...new Set(slugs)].slice(0, MAX_APPS_AT_CREATION)
}
