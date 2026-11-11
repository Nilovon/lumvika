'use server'

import { requireWorkspaceContext } from '@/app/api/_auth/ownership'
import { getWorkspaceConnection } from '@/app/api/_services/workspace-engine.service'
import { supportsStewardFiles } from '@/lib/engine/client'
import { STEWARD_FILES_BUCKET, stewardFileKey } from '@/lib/steward/files'
import { readStewardFile } from '@/lib/steward/read-attachment'
import { removePrivateFiles } from '@/lib/storage/private'

/** Drops an attachment the user took back out of the composer after its bytes had landed. */
export async function deleteStewardFileAction(sessionId: string, path: string): Promise<void> {
    const ctx = await requireWorkspaceContext()
    await removePrivateFiles(ctx.scope, STEWARD_FILES_BUCKET, [stewardFileKey(ctx, sessionId, path)])
}

/** Backs the lightbox when the user opens a text attachment of a steward conversation. */
export async function readStewardFileAction(sessionId: string, path: string): Promise<{ content: string; truncated: boolean }> {
    const ctx = await requireWorkspaceContext()
    return readStewardFile(ctx, sessionId, path)
}

/**
 * Whether the steward on the workspace's engine takes files in its own workspace. Boxes update on
 * their own schedule, and one that predates it answers 403 to every upload.
 */
export async function stewardEngineFilesAction(): Promise<boolean> {
    try {
        const ctx = await requireWorkspaceContext()
        return await supportsStewardFiles(await getWorkspaceConnection(ctx.workspace.id))
    } catch {
        return false
    }
}
