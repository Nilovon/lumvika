// Palette catégorielle des séries de graphes, partagée par tous les graphes de monitoring.
// Volontairement indépendante des tokens --chart-* (qui sont une échelle de gris) : ici il faut des
// teintes distinctes, choisies au niveau 500 pour rester lisibles sur fond clair comme sur fond sombre.
export const CHART_PALETTE = ['#6366f1', '#22c55e', '#f59e0b', '#ec4899', '#06b6d4', '#a855f7', '#ef4444', '#84cc16']

// Séries repliées dans « Other » et valeurs sans groupe connu.
export const CHART_FALLBACK_COLOR = '#9ca3af'

export function chartColorAt(index: number): string {
    return CHART_PALETTE[index % CHART_PALETTE.length]
}
