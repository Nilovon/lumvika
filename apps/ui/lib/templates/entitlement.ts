import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/app/api/database.types'
import { MARKETPLACE_ENABLED } from '@lumvika/cloud/marketplace'
import { selectMany, selectMaybeSingle } from '@/supabase/supabase-helpers'

// Who may install what. A purchase belongs to the workspace, like every other thing Lumvika bills, so
// this is always answered against a workspace id and never against the person clicking.
//
// `past_due` stays entitled on purpose: Stripe retries a failed invoice for weeks before emitting
// `customer.subscription.deleted`, and cutting a paying customer off on the first declined card is
// hostile. Revocation happens on `deleted`.

export const ENTITLED_PURCHASE_STATUSES = ['active', 'past_due'] as const

export type PurchaseAccess = 'none' | 'active' | 'lapsed' | 'refunded'

export type EntitlementSubject = { id: string; pricing_model: string; creator_id: string | null }

function accessOf(status: string | undefined): PurchaseAccess {
    if (!status) return 'none'
    if (status === 'active' || status === 'past_due') return 'active'
    if (status === 'refunded') return 'refunded'
    return status === 'canceled' ? 'lapsed' : 'none'
}

// One read per library render rather than one per card. Includes lapsed and refunded purchases:
// the library has to tell "never bought" apart from "no longer yours".
export async function templateAccessByWorkspace(supabase: SupabaseClient<Database>, workspaceId: number): Promise<Map<string, PurchaseAccess>> {
    const { data } = await selectMany(supabase, 'template_purchases', ['template_id', 'status'] as const, { workspace_id: workspaceId })
    return new Map((data ?? []).map(row => [row.template_id, accessOf(row.status)]))
}

export async function hasTemplateEntitlement(
    supabase: SupabaseClient<Database>,
    workspaceId: number,
    template: EntitlementSubject,
    viewerId?: string | null,
): Promise<boolean> {
    if (!MARKETPLACE_ENABLED || template.pricing_model === 'free') return true
    if (viewerId && template.creator_id === viewerId) return true

    const { data } = await selectMaybeSingle(supabase, 'template_purchases', ['status'] as const, { workspace_id: workspaceId, template_id: template.id })
    return !!data && (ENTITLED_PURCHASE_STATUSES as readonly string[]).includes(data.status)
}
