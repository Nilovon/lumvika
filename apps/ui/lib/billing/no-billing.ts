import type Stripe from 'stripe'
import type { AddonKey, BillingInterval } from '@lumvika/contracts'

// This product sells nothing: no workspace carries a Stripe subscription, so the code paths that
// read one stop at their `stripe_subscription_id` check. A call that gets past it is a bug.
function billingDisabled(): never {
    throw new Error('Billing is not part of this product.')
}

export const stripe = new Proxy({} as Stripe, { get: billingDisabled })

export const intervalOfItems = (_items: Stripe.SubscriptionItem[]): BillingInterval => 'monthly'
export const addonForPriceId = (_priceId: string | undefined): AddonKey | undefined => undefined
export const priceIdForAddon = (_addonKey: AddonKey, _interval: BillingInterval): string => billingDisabled()
