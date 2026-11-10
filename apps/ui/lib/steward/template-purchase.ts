import 'server-only'

import type { TemplatePricing, TemplatePricingModel } from '@lumvika/contracts'

import type { WorkspaceContext } from '@/app/api/_auth/ownership'
import { hasTemplateEntitlement } from '@/lib/templates/entitlement'
import { selectMaybeSingle } from '@/supabase/supabase-helpers'
import type { StewardPlan } from './phase'

// A paid template is bought before it is installed, and the purchase needs a plan: so it is asked
// for between the trial and the build, as a card of its own.
export type OwedTemplatePurchase = { slug: string; title: string; pricing: TemplatePricing }

const PURCHASE_COLUMNS = ['id', 'slug', 'title', 'pricing_model', 'price_amount_cents', 'price_currency', 'creator_id'] as const

/** The template of the plan the workspace still has to buy, or `null` when the build can go ahead. */
export async function owedTemplatePurchase(ctx: WorkspaceContext, plan: StewardPlan | undefined): Promise<OwedTemplatePurchase | null> {
    const item = plan?.items.find(candidate => candidate.kind === 'template')
    if (item?.kind !== 'template') return null

    const { data: template } = await selectMaybeSingle(ctx.supabase, 'templates', PURCHASE_COLUMNS, { slug: item.slug })
    if (!template || (await hasTemplateEntitlement(ctx.supabase, ctx.workspace.id, template, ctx.userId))) return null

    return { slug: template.slug, title: template.title, pricing: { model: template.pricing_model as TemplatePricingModel, amountCents: template.price_amount_cents, currency: template.price_currency } }
}
