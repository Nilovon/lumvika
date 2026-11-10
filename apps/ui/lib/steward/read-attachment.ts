import 'server-only'

import type { WorkspaceContext } from '@/app/api/_auth/ownership'
import { filePreviewKind } from '@/lib/files/preview'
import { downloadPrivateFile } from '@/lib/storage/private'
import { TEXT_FILE_PAGE_CHARS } from '@lumvika/contracts'

import { STEWARD_FILES_BUCKET, stewardFileKey } from './files'

export type StewardFileRead = { content: string; truncated: boolean }

/**
 * Reads a file the user attached to a steward conversation. Text only: the steward runs on a model
 * with no vision, so an image is named rather than pretended to be read.
 */
export async function readStewardFile(ctx: Pick<WorkspaceContext, 'userId' | 'workspace' | 'supabase'>, sessionId: string, path: string): Promise<StewardFileRead> {
    const name = path.split('/').pop() ?? path
    if (filePreviewKind(name) !== 'text') {
        return { content: `${name} is not a text file, so its contents cannot be read here.`, truncated: false }
    }
    const blob = await downloadPrivateFile(ctx.supabase, STEWARD_FILES_BUCKET, stewardFileKey(ctx, sessionId, path))
    const text = await blob.text()
    return { content: text.slice(0, TEXT_FILE_PAGE_CHARS), truncated: text.length > TEXT_FILE_PAGE_CHARS }
}
