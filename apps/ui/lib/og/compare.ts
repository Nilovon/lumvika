// Kept in step with `COMPARE_SLUGS` in cloud/apps/landing/components/compare/paths.ts: the slug is the
// public URL of the page the card is shared for. A mark that is already an app icon fills its tile,
// a bare glyph sits inside it.
export type CompareOgCompetitor = { slug: string; title: string; mark: string; glyph?: boolean }

const mark = (file: string) => `/og/competitors/${file}`

export const COMPARE_OG_COMPETITORS: CompareOgCompetitor[] = [
    { slug: 'lumvika-vs-claude-cowork', title: 'Claude Cowork', mark: mark('claude-cowork.svg'), glyph: true },
    { slug: 'lumvika-vs-manus', title: 'Manus', mark: mark('manus.png') },
    { slug: 'lumvika-vs-grok-bot', title: 'Grok Bot', mark: mark('grok-bot.png') },
    { slug: 'lumvika-vs-hermes-agent', title: 'Hermes Agent', mark: mark('hermes.png') },
    { slug: 'lumvika-vs-openclaw', title: 'OpenClaw', mark: mark('openclaw.svg'), glyph: true },
    { slug: 'lumvika-vs-paperclip', title: 'Paperclip', mark: mark('paperclip.svg') },
    { slug: 'lumvika-vs-zapier', title: 'Zapier', mark: mark('zapier.svg'), glyph: true },
    { slug: 'lumvika-vs-make', title: 'Make', mark: mark('make.svg'), glyph: true },
    { slug: 'lumvika-vs-n8n', title: 'n8n', mark: mark('n8n.svg'), glyph: true },
    { slug: 'lumvika-vs-lindy', title: 'Lindy', mark: mark('lindy.png') },
    { slug: 'lumvika-vs-twin', title: 'Twin', mark: mark('twin.svg') },
    { slug: 'lumvika-vs-dust', title: 'Dust', mark: mark('dust.png') },
    { slug: 'lumvika-vs-squad', title: 'Squad', mark: mark('squad.svg') },
]

export function compareOgCompetitor(slug: string): CompareOgCompetitor | null {
    return COMPARE_OG_COMPETITORS.find(competitor => competitor.slug === slug) ?? null
}
