'use client'

import type { TeamCursor } from '@/supabase/useTeamCursors'
import { CursorOverlay as SharedCursorOverlay } from '@rerun/ui/cursors'

export function CursorOverlay({ cursors, zoom }: { cursors: TeamCursor[]; zoom: number }) {
    return <SharedCursorOverlay cursors={cursors.map(c => ({ ...c, id: c.userId }))} zoom={zoom} />
}
