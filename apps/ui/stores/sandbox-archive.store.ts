import { create } from 'zustand'

import type { SandboxArchiveState } from '@/app/api/_actions/workspace-restore.actions'

// What the server says about an archived sandbox. The session only carries `boxes_archived_at`,
// which cannot tell a sandbox waiting on an approval from one being restored, and is null again
// once an expired archive has been purged while the sandbox is still locked.
type SandboxArchiveStore = {
    workspaceId: number | null
    archive: SandboxArchiveState | null
    setArchive: (workspaceId: number, archive: SandboxArchiveState | null) => void
}

export const useSandboxArchiveStore = create<SandboxArchiveStore>(set => ({
    workspaceId: null,
    archive: null,
    setArchive: (workspaceId, archive) => set({ workspaceId, archive }),
}))
