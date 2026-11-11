import sharp from 'sharp'
import { EXPERT_PHOTOS_BUCKET, publicUrl, uploadObject } from '@lumvika/storage'

// Re-hosts scraped images in our own bucket instead of hotlinking (LinkedIn and X CDN URLs expire).
// Cover crop, webp. Best-effort — returns null on any
// failure so a missing image never blocks the import. The path is derived from the slug rather than
// a uuid so a task retry overwrites instead of piling up orphans.

async function rehostImage(sourceUrl: string, path: string, width: number, height: number): Promise<string | null> {
    try {
        const res = await fetch(sourceUrl)
        if (!res.ok) return null
        const webp = await sharp(Buffer.from(await res.arrayBuffer())).resize(width, height, { fit: 'cover' }).webp({ quality: 82 }).toBuffer()
        const { error } = await uploadObject(EXPERT_PHOTOS_BUCKET, path, new Uint8Array(webp), { contentType: 'image/webp' })
        if (error) return null
        return publicUrl(EXPERT_PHOTOS_BUCKET, path)
    } catch {
        return null
    }
}

export function rehostAvatar(photoUrl: string, slug: string): Promise<string | null> {
    return rehostImage(photoUrl, `imported/${slug}.webp`, 512, 512)
}

// 1500x500 is the native X header ratio, and the profile page renders banners full width in a
// short band with object-cover, so a 3:1 source needs no upscale and loses nothing to the crop.
export function rehostBanner(bannerUrl: string, slug: string): Promise<string | null> {
    return rehostImage(bannerUrl, `imported/${slug}-banner.webp`, 1500, 500)
}
