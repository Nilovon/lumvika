import { listObjects, publicUrl, uploadObject, type Bucket } from './s3'

// The single owner of the experts image storage layout, shared by the three write paths: the admin
// form (`admin/`), the landing claim wizard and the in-app profile dialog (both `claimed/`).
export const EXPERT_PHOTOS_BUCKET = 'expert-photos' satisfies Bucket
export const EXPERT_BANNERS_BUCKET = 'banner-illustrations' satisfies Bucket

const MAX_IMAGE_BYTES = 8 * 1024 * 1024

export type ExpertImageFolder = 'photo' | 'banner'
export type ExpertImagePrefix = 'admin' | 'claimed'
export type ExpertImageUploadResult = { ok: true; url: string } | { ok: false; error: string }

export async function uploadExpertImage({ expertId, file, folder, prefix }: { expertId: string; file: unknown; folder: ExpertImageFolder; prefix: ExpertImagePrefix }): Promise<ExpertImageUploadResult> {
    if (!(file instanceof File)) return { ok: false, error: 'No file provided.' }
    if (!file.type.startsWith('image/')) return { ok: false, error: 'Please choose an image file.' }
    if (file.size > MAX_IMAGE_BYTES) return { ok: false, error: 'Image is too large (max 8MB).' }

    const extension =
        file.name
            .split('.')
            .pop()
            ?.toLowerCase()
            .replace(/[^a-z0-9]/g, '') || 'png'
    const path = `${prefix}/${expertId}/${folder}/${crypto.randomUUID()}.${extension}`
    const { error } = await uploadObject(EXPERT_PHOTOS_BUCKET, path, new Uint8Array(await file.arrayBuffer()), { contentType: file.type })
    if (error) throw new Error(error.message)

    return { ok: true, url: publicUrl(EXPERT_PHOTOS_BUCKET, path) }
}

// banner_url is NOT NULL on experts, so imported profiles get a randomly assigned illustration.
// Rather than maintaining a duplicated file list, we read the banner-illustrations bucket at
// runtime (same source the admin banners generator writes to).
export async function listExpertBannerUrls(): Promise<string[]> {
    const { data, error } = await listObjects(EXPERT_BANNERS_BUCKET)
    if (error || !data) return []
    return data
        .filter(f => f.name.endsWith('.webp'))
        .sort((a, b) => scrambleSeed(a.name) - scrambleSeed(b.name))
        .map(f => publicUrl(EXPERT_BANNERS_BUCKET, f.name))
}

// Storage lists alphabetically and every filename starts with its dominant color, so the raw order
// stacks all the blues, then all the violets. Ordering on a hash of the name breaks those runs up
// while keeping the grid stable from one open to the next.
function scrambleSeed(name: string): number {
    let hash = 0
    for (let i = 0; i < name.length; i++) hash = (Math.imul(hash, 31) + name.charCodeAt(i)) | 0
    return hash
}

export async function randomExpertBannerUrl(): Promise<string | null> {
    const urls = await listExpertBannerUrls()
    if (urls.length === 0) return null
    return urls[Math.floor(Math.random() * urls.length)]
}
