export const BRAND_OG_CARDS = ['default', 'experts', 'templates', 'pricing'] as const

export type BrandOgCard = (typeof BRAND_OG_CARDS)[number]

export function isBrandOgCard(value: string): value is BrandOgCard {
    return (BRAND_OG_CARDS as readonly string[]).includes(value)
}

export const BRAND_OG_LABELS: Record<BrandOgCard, string> = {
    default: 'Carte par défaut',
    experts: 'Marketplace experts',
    templates: 'Marketplace templates',
    pricing: 'Page pricing',
}
