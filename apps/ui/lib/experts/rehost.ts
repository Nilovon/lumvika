import sharp from 'sharp'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@rerun/db'

// Re-hosts scraped images in our own bucket instead of hotlinking (LinkedIn and X CDN URLs expire).
// Cover crop, webp. Best-effort — returns null on any
// failure so a missing image never blocks the import. The path is derived from the slug rather than
// a uuid so a task retry overwrites instead of piling up orphans.

const BUCKET = 'expert-photos'

async function rehostImage(
    supabase: SupabaseClient<Database>,
    sourceUrl: string,
    path: string,
    width: number,
    height: number,
): Promise<string | null> {
    try {
        const res = await fetch(sourceUrl)
        if (!res.ok) return null
        const webp = await sharp(Buffer.from(await res.arrayBuffer())).resize(width, height, { fit: 'cover' }).webp({ quality: 82 }).toBuffer()
        const { error } = await supabase.storage.from(BUCKET).upload(path, new Uint8Array(webp), { contentType: 'image/webp', upsert: true })
        if (error) return null
        const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
        return data.publicUrl
    } catch {
        return null
    }
}

export function rehostAvatar(supabase: SupabaseClient<Database>, photoUrl: string, slug: string): Promise<string | null> {
    return rehostImage(supabase, photoUrl, `imported/${slug}.webp`, 512, 512)
}

// 1500x500 is the native X header ratio, and the profile page renders banners full width in a
// short band with object-cover, so a 3:1 source needs no upscale and loses nothing to the crop.
export function rehostBanner(supabase: SupabaseClient<Database>, bannerUrl: string, slug: string): Promise<string | null> {
    return rehostImage(supabase, bannerUrl, `imported/${slug}-banner.webp`, 1500, 500)
}
