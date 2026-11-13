'use client'

import { getProjectAccessAction, grantProjectAccessAction, revokeProjectAccessAction, updateProjectAction, type ProjectAccessView } from '@/app/api/_actions/projects.actions'
import { PanelDialogContent } from '@/components/dialogs/PanelDialogContent'
import { ProjectAccessPanel } from '@/components/projects/access/ProjectAccessPanel'
import { Dialog } from '@/components/ui/dialog'
import { useErrorText } from '@/hooks/useErrorText'
import { useMemberDirectory } from '@/hooks/useMemberProfiles'
import { useSession } from '@/supabase/session/SessionProvider'
import type { ProjectAccess, ProjectDetail, ProjectVisibility } from '@lumvika/contracts'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

type Result = { ok: true } | { ok: false; error: string; code?: string }

// Who reaches a project, the twin of the Box access dialog: open to the workspace or restricted, and
// the people named on it with use or manage. Opened by someone who manages the project.
export function ProjectAccessDialog({ project, open, onOpenChange, onChanged }: { project: ProjectDetail; open: boolean; onOpenChange: (open: boolean) => void; onChanged: () => void }) {
    const errorText = useErrorText()
    const { workspace } = useSession()
    const profileOf = useMemberDirectory(workspace?.id)
    const [access, setAccess] = useState<ProjectAccessView | null>(null)
    const [busy, setBusy] = useState(false)

    const refresh = useCallback(async () => {
        const result = await getProjectAccessAction(project.id)
        if (!result.ok) {
            toast.error(errorText(result))
            return
        }
        setAccess(result)
    }, [project.id, errorText])

    useEffect(() => {
        if (!open) return
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setAccess(null)
        void refresh()
    }, [open, refresh])

    const run = async (action: () => Promise<Result>): Promise<boolean> => {
        if (busy) return false
        setBusy(true)
        const result = await action()
        if (!result.ok) toast.error(errorText(result))
        await refresh()
        onChanged()
        setBusy(false)
        return result.ok
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <PanelDialogContent className="sm:h-[min(36rem,88dvh)] sm:max-w-lg">
                <ProjectAccessPanel
                    projectName={project.name}
                    visibility={project.visibility}
                    access={access}
                    busy={busy}
                    profileOf={profileOf}
                    onVisibilityChange={(visibility: ProjectVisibility) => void run(() => updateProjectAction(project.id, { visibility }))}
                    onAccessChange={(userId, level: ProjectAccess) => void run(() => grantProjectAccessAction(project.id, [userId], level))}
                    onRemove={userId => void run(() => revokeProjectAccessAction(project.id, userId))}
                    onAdd={(userIds, level) => run(() => grantProjectAccessAction(project.id, userIds, level))}
                />
            </PanelDialogContent>
        </Dialog>
    )
}
