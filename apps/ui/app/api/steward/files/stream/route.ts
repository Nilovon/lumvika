import { requireWorkspaceContext } from '@/app/api/_auth/ownership'
import { mediaContentType } from '@/lib/files/content-type'
import { invalidDir, invalidName } from '@/lib/files/path-guards'
import { STEWARD_FILES_BUCKET, stewardFileKey } from '@/lib/steward/files'
import { STEWARD_MAX_UPLOAD_BYTES } from '@/lib/steward/upload-limit'
import { uploadPrivateFile } from '@/lib/storage/private'
import { withQueryWorkspace } from '@/lib/workspace/query-workspace'

export const runtime = 'nodejs'

const MB = 1024 * 1024

// The steward's counterpart of /api/files/stream. Same contract on the wire, a different store
// behind it: there is no Box under the steward, so its attachments and voice notes go to a private
// bucket keyed by workspace, member and conversation.
async function upload(req: Request) {
    let ctx: Awaited<ReturnType<typeof requireWorkspaceContext>>
    try {
        ctx = await requireWorkspaceContext()
    } catch {
        return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(req.url)
    const sessionId = url.searchParams.get('sessionId') ?? ''
    const dir = url.searchParams.get('dir') ?? ''
    const name = url.searchParams.get('name') ?? ''
    const size = Number(url.searchParams.get('size') ?? 0)

    if (!sessionId || invalidName(sessionId)) return Response.json({ error: 'Invalid session id' }, { status: 400 })
    if (invalidName(name)) return Response.json({ error: 'Invalid file name' }, { status: 400 })
    if (invalidDir(dir)) return Response.json({ error: 'Invalid directory' }, { status: 400 })
    if (size > STEWARD_MAX_UPLOAD_BYTES) {
        return Response.json({ error: `${name} is over the ${STEWARD_MAX_UPLOAD_BYTES / MB} MB limit.` }, { status: 413 })
    }
    if (!req.body) return Response.json({ error: 'Expected the file bytes as the request body' }, { status: 400 })

    const path = dir ? `${dir}/${name}` : name
    try {
        const bytes = new Uint8Array(await req.arrayBuffer())
        if (bytes.byteLength > STEWARD_MAX_UPLOAD_BYTES) {
            return Response.json({ error: `${name} is over the ${STEWARD_MAX_UPLOAD_BYTES / MB} MB limit.` }, { status: 413 })
        }
        await uploadPrivateFile(ctx.scope, STEWARD_FILES_BUCKET, stewardFileKey(ctx, sessionId, path), bytes, mediaContentType(name) ?? 'application/octet-stream')
        return Response.json({ path, bytes: bytes.byteLength }, { status: 201 })
    } catch (err) {
        return Response.json({ error: err instanceof Error ? err.message : 'Failed to save the file' }, { status: 500 })
    }
}

export const POST = withQueryWorkspace(upload)
