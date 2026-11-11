import type { DbScope } from '@/lib/db'
import { downloadObject, removeObjects, uploadObject, type Bucket } from '@lumvika/storage'

// The public counterpart of this helper is lib/images/upload.ts. Here the bucket is private and
// no public URL is ever handed back: reaching an object takes the server or a signed URL, so the
// stored path is not itself a capability. The scope is kept for the callers' signature; object
// storage has no row level security to apply it to.
export async function uploadPrivateFile(_scope: DbScope, bucket: Bucket, path: string, body: Blob | ArrayBuffer | Uint8Array, contentType: string): Promise<string> {
    const { error } = await uploadObject(bucket, path, body instanceof ArrayBuffer ? new Uint8Array(body) : body, { contentType })
    if (error) throw new Error(error.message)

    return path
}

export const STORAGE_BUSY_ERROR = 'Lumvika is very busy right now and could not fetch this file. Try again in a minute.'

// A burst of refused connections lasts a few seconds: on the launch night it cost two coworkers
// out of three of a starter team. A download is a read, so it is safe to play again.
const DOWNLOAD_RETRY_DELAYS_MS = [400, 1200, 3000]

const MISSING_OBJECT = /NoSuchKey|not found|does not exist|is empty/i

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export async function downloadPrivateFile(_scope: DbScope, bucket: Bucket, path: string): Promise<Blob> {
    for (let attempt = 0; ; attempt += 1) {
        const { data, error } = await downloadObject(bucket, path)
        if (!error) return new Blob([data as Uint8Array<ArrayBuffer>])
        if (MISSING_OBJECT.test(error.message)) throw new Error(error.message)
        if (attempt === DOWNLOAD_RETRY_DELAYS_MS.length) {
            console.warn('[storage] download gave up after retries', bucket, path, error.message)
            throw new Error(STORAGE_BUSY_ERROR, { cause: error })
        }
        await pause(DOWNLOAD_RETRY_DELAYS_MS[attempt] * (1 + Math.random() * 0.25))
    }
}

export async function removePrivateFiles(_scope: DbScope, bucket: Bucket, paths: string[]): Promise<void> {
    if (paths.length === 0) return
    const { error } = await removeObjects(bucket, paths)
    if (error) throw new Error(error.message)
}
