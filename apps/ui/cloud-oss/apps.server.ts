import 'server-only'

import type { DbScope } from '@/lib/db'
import type { AppSlug } from './apps'

export async function unbindAgent(_scope: DbScope, _workspaceId: number, _agentId: string, _slug: AppSlug): Promise<void> {}

// No paid app is offered here: the self-hosted build runs without a Linkup account.
export async function paidAppFlag(_slug: AppSlug): Promise<boolean> {
    return false
}

export async function paidAppFlags(): Promise<Partial<Record<AppSlug, boolean>>> {
    return {}
}
