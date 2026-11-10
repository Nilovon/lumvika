import type { AppStatus } from './types'

export type WorkspaceBoxState = { boxes_archived_at: string | null; boxes_deleted_at: string | null }

// The app reads its fate off the box, never off Stripe: the teardown already turns a lost payment
// into an archive, and an expired archive or a deleted account into a box gone for good.
export function targetAppStatus(workspace: WorkspaceBoxState): AppStatus {
    if (workspace.boxes_deleted_at) return 'uninstalled'
    if (workspace.boxes_archived_at) return 'frozen'
    return 'active'
}

export type AppTransition = 'freeze' | 'resume' | 'uninstall' | null

export function appTransition(current: AppStatus, target: AppStatus): AppTransition {
    if (current === target) return null
    if (target === 'uninstalled') return 'uninstall'
    if (target === 'frozen') return current === 'active' ? 'freeze' : null
    return current === 'frozen' ? 'resume' : null
}
