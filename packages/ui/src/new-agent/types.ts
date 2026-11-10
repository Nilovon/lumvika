// A connector as the catalogue lists it: enough to draw its logo and to search it by name.
// `category` is a service category slug; a catalogue that carries none is simply not filtered.
export type CatalogEntry = {
    slug: string
    name: string
    icon: string | null
    category?: string
}

export type ConnectorCatalog = Map<string, CatalogEntry>

// A first job to hand the agent, offered under the description field so the composer is not an
// empty page. Picking one writes its `kickoff` in the field, where it can be edited, and it is then
// sent as the first chat message: so it is written the way the user would have written it, first
// person, one concrete outcome, no preamble. `description` is what the chip promises in one line,
// the outcome rather than the steps. `apps` are the catalogue slugs the agent starts with, the best
// known for the job: a slug the catalogue drops simply stops being drawn and attached.
export type AgentSuggestion = { id: string; title: string; description: string; name: string; kickoff: string; apps: string[] }
