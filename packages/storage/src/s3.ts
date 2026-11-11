import { CreateBucketCommand, DeleteObjectsCommand, GetObjectCommand, HeadBucketCommand, ListObjectsV2Command, PutBucketPolicyCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

// Every bucket the app writes to. A public one is served straight from S3_PUBLIC_URL; a private one
// is only ever read by the server or through a signed URL.
export const BUCKETS = {
    'agent-archives': { public: false },
    'agent-shares': { public: false },
    'banner-illustrations': { public: true },
    'blob-illustrations': { public: true },
    'changelog-images': { public: true },
    'expert-photos': { public: true },
    'published': { public: false },
    'service-icons': { public: true },
    'steward-files': { public: false },
    'template-media': { public: true },
    'user-avatars': { public: true },
    'workspace-logos': { public: true },
} as const satisfies Record<string, { public: boolean }>

export type Bucket = keyof typeof BUCKETS

export type StorageResult<T> = { data: T; error: null } | { data: null; error: { message: string } }

type Holder = { client: S3Client }
const holder = globalThis as typeof globalThis & { __lumvikaStorage?: Holder }

function required(name: string): string {
    const value = process.env[name]
    if (!value) throw new Error(`${name} is not set.`)
    return value
}

function client(): S3Client {
    holder.__lumvikaStorage ??= {
        client: new S3Client({
            endpoint: process.env.S3_ENDPOINT,
            region: process.env.S3_REGION ?? 'auto',
            // Path-style addressing (`<endpoint>/<bucket>/<key>`) works with RustFS, MinIO, R2 and AWS alike.
            forcePathStyle: true,
            credentials: { accessKeyId: required('S3_ACCESS_KEY_ID'), secretAccessKey: required('S3_SECRET_ACCESS_KEY') },
        }),
    }
    return holder.__lumvikaStorage.client
}

// A deployment sharing one S3 account with others names its buckets `<prefix><bucket>`.
export function bucketName(bucket: Bucket): string {
    return `${process.env.S3_BUCKET_PREFIX ?? ''}${bucket}`
}

async function settle<T>(work: () => Promise<T>): Promise<StorageResult<T>> {
    try {
        return { data: await work(), error: null }
    } catch (cause) {
        return { data: null, error: { message: cause instanceof Error ? cause.message : String(cause) } }
    }
}

type Body = Uint8Array | Buffer | Blob | string

async function bytesOf(body: Body): Promise<Uint8Array | string> {
    return body instanceof Blob ? new Uint8Array(await body.arrayBuffer()) : body
}

export function uploadObject(bucket: Bucket, path: string, body: Body, options: { contentType?: string; cacheControl?: string } = {}): Promise<StorageResult<{ path: string }>> {
    return settle(async () => {
        await client().send(new PutObjectCommand({ Bucket: bucketName(bucket), Key: path, Body: await bytesOf(body), ContentType: options.contentType, CacheControl: options.cacheControl }))
        return { path }
    })
}

export function downloadObject(bucket: Bucket, path: string): Promise<StorageResult<Uint8Array>> {
    return settle(async () => {
        const object = await client().send(new GetObjectCommand({ Bucket: bucketName(bucket), Key: path }))
        if (!object.Body) throw new Error(`${bucket}/${path} is empty.`)
        return object.Body.transformToByteArray()
    })
}

export function removeObjects(bucket: Bucket, paths: string[]): Promise<StorageResult<{ removed: number }>> {
    return settle(async () => {
        if (paths.length === 0) return { removed: 0 }
        let removed = 0
        // S3 deletes at most a thousand keys per request.
        for (let start = 0; start < paths.length; start += 1000) {
            const keys = paths.slice(start, start + 1000).map(Key => ({ Key }))
            const answer = await client().send(new DeleteObjectsCommand({ Bucket: bucketName(bucket), Delete: { Objects: keys, Quiet: true } }))
            removed += keys.length - (answer.Errors?.length ?? 0)
        }
        return { removed }
    })
}

export type StoredObject = { name: string; size: number; updatedAt: string | null }

// The objects directly under `prefix` (no trailing slash needed), like a folder listing.
export function listObjects(bucket: Bucket, prefix = '', { limit = 1000 }: { limit?: number } = {}): Promise<StorageResult<StoredObject[]>> {
    return settle(async () => {
        const folder = prefix && !prefix.endsWith('/') ? `${prefix}/` : prefix
        const objects: StoredObject[] = []
        let token: string | undefined
        do {
            const page = await client().send(new ListObjectsV2Command({ Bucket: bucketName(bucket), Prefix: folder, Delimiter: '/', ContinuationToken: token, MaxKeys: Math.min(limit - objects.length, 1000) }))
            for (const item of page.Contents ?? []) {
                if (!item.Key) continue
                objects.push({ name: item.Key.slice(folder.length), size: item.Size ?? 0, updatedAt: item.LastModified?.toISOString() ?? null })
            }
            token = page.IsTruncated ? page.NextContinuationToken : undefined
        } while (token && objects.length < limit)
        return objects
    })
}

export function publicUrl(bucket: Bucket, path: string): string {
    const base = (process.env.S3_PUBLIC_URL ?? process.env.S3_ENDPOINT ?? '').replace(/\/$/, '')
    return `${base}/${bucketName(bucket)}/${path.split('/').map(encodeURIComponent).join('/')}`
}

export function signedUrl(bucket: Bucket, path: string, expiresInSeconds: number, options: { download?: string | boolean } = {}): Promise<StorageResult<string>> {
    return settle(() => {
        const disposition = options.download ? `attachment${typeof options.download === 'string' ? `; filename="${options.download.replace(/"/g, '')}"` : ''}` : undefined
        return getSignedUrl(client(), new GetObjectCommand({ Bucket: bucketName(bucket), Key: path, ResponseContentDisposition: disposition }), { expiresIn: expiresInSeconds })
    })
}

// Creates every bucket that is missing and opens the public ones to anonymous reads. Run by
// `pnpm db:start` locally and once on a new deployment.
export async function ensureBuckets(): Promise<void> {
    for (const [bucket, { public: isPublic }] of Object.entries(BUCKETS) as [Bucket, { public: boolean }][]) {
        const name = bucketName(bucket)
        const exists = await client()
            .send(new HeadBucketCommand({ Bucket: name }))
            .then(() => true)
            .catch(() => false)
        if (!exists) await client().send(new CreateBucketCommand({ Bucket: name }))
        if (isPublic) {
            const policy = { Version: '2012-10-17', Statement: [{ Effect: 'Allow', Principal: { AWS: ['*'] }, Action: ['s3:GetObject'], Resource: [`arn:aws:s3:::${name}/*`] }] }
            await client().send(new PutBucketPolicyCommand({ Bucket: name, Policy: JSON.stringify(policy) }))
        }
    }
}
