import { extractPhotoUrl, scrapeLinkedinProfile } from './linkedin-scrape'
import type { ExpertSource } from './source'
import { extractXBannerUrl, extractXPhotoUrl, scrapeXProfile } from './x-scrape'

export type ScrapedProfile = { raw: unknown; photoUrl: string | null; bannerUrl: string | null }

export async function scrapeProfile(url: string, source: ExpertSource): Promise<ScrapedProfile> {
    if (source === 'x') {
        const profile = await scrapeXProfile(url)
        return { raw: profile, photoUrl: extractXPhotoUrl(profile), bannerUrl: extractXBannerUrl(profile) }
    }
    const profile = await scrapeLinkedinProfile(url)
    return { raw: profile, photoUrl: extractPhotoUrl(profile), bannerUrl: null }
}
