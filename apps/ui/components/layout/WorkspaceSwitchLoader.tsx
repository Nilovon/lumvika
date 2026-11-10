'use client'

import { AppLoader } from '@/components/layout/AppLoader'
import { useWorkspaceSwitchLoader } from '@/lib/workspace/workspace-switch'

// Covers the app from the click until the new document paints its own loader: the page being left
// stays on screen during the hard navigation, so this is what bridges the two without a wait.
export function WorkspaceSwitchLoader() {
    const visible = useWorkspaceSwitchLoader()
    if (!visible) return null
    return <AppLoader className="fixed inset-0 z-[100] h-auto animate-in fade-in-0 duration-200" />
}
