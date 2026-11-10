import { PAID_DATA_DEFAULT_PRICE_MULTIPLIER } from '@rerun/contracts'

// What a workspace pays for a paid data call, as a multiple of what Treg charged us. An env var so
// the margin moves without a deploy.
export function paidDataPriceMultiplier(): number {
    const value = Number(process.env.PAID_DATA_PRICE_MULTIPLIER)
    return Number.isFinite(value) && value > 0 ? value : PAID_DATA_DEFAULT_PRICE_MULTIPLIER
}

export function billedMicros(providerCostMicros: number): number {
    return Math.round(providerCostMicros * paidDataPriceMultiplier())
}
