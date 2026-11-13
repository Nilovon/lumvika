'use client'

import { useSession } from '@/lib/auth/session/SessionProvider'

export const PRICING_ICONS = ['/pricing/solo.png', '/pricing/team.png', '/pricing/scale.png']

// A workspace without a logo of its own wears one of the plan pictures, picked by its rank among the
// account's workspaces so it keeps the same one from a page to the next.
export function useWorkspaceIcon(): string {
    const { workspace, workspaces } = useSession()
    const sorted = workspaces.filter(w => !w.is_sandbox).sort((a, b) => a.id - b.id)
    const activeIndex = Math.max(0, sorted.findIndex(w => w.id === workspace?.id))
    return PRICING_ICONS[activeIndex % PRICING_ICONS.length]
}
