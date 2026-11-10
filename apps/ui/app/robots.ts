import type { MetadataRoute } from 'next'

/**
 * The app itself has nothing to index, so `app.lumvika.com` is closed to crawlers. `/og/` stays open
 * on purpose: the template and expert cards are served from this host but referenced by the landing,
 * and both Twitterbot and Facebook's crawler honour robots.txt, so a bare `Disallow: /` would break
 * every link preview on lumvika.com.
 */
export default function robots(): MetadataRoute.Robots {
    return {
        rules: [{ userAgent: '*', allow: '/og/', disallow: '/' }],
    }
}
