import 'server-only'
import type { DbScope } from '@/lib/db'

// No billing in this build: nothing charges, nothing has to be stopped before an account goes.
export async function subscriptionStillCharges(_subscriptionId: string): Promise<boolean> {
    return false
}

export async function stopWorkspaceCharges(_scope: DbScope, _workspace: { id: number; name: string; isSandbox: boolean; stripeCustomerId: string | null }): Promise<void> {}

export async function uninstallWorkspaceApps(_scope: DbScope, _workspaceId: number): Promise<void> {}
