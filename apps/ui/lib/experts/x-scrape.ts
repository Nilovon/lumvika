import { runApifyActor } from './apify'

// Scrapes an X (Twitter) profile through Apify. An X bio is capped at 160 characters, so the
// profile alone is not enough material to write an expert page: the latest tweets are fetched too
// and handed to the LLM alongside it (see enrich.ts). Tweets are best-effort — a protected or
// empty account still yields a draft. Types stay loose, the raw JSON is what the model reads.

const DEFAULT_PROFILE_ACTOR = 'apidojo/twitter-user-scraper'
const DEFAULT_TWEETS_ACTOR = 'apidojo/tweet-scraper'
const MAX_TWEETS = 30
const MAX_TWEET_LENGTH = 400

export type RawXUser = Record<string, unknown> & {
    id?: string
    userName?: string
    name?: string
    description?: string
    location?: string
    profilePicture?: string
    coverPicture?: string
    followers?: number
    following?: number
    statusesCount?: number
    createdAt?: string
    isVerified?: boolean
    isBlueVerified?: boolean
    protected?: boolean
    // The bio only ever holds t.co links; entities is where the real destinations live.
    entities?: { url?: { urls?: unknown[] }; description?: { urls?: unknown[] } }
}

export type XTweet = {
    text: string
    createdAt?: string
    likeCount?: number
    retweetCount?: number
    isReply?: boolean
    isRetweet?: boolean
}

export type RawXProfile = {
    profile: RawXUser
    tweets: XTweet[]
}

// x.com/i/flow/login and friends are app routes, not profiles — importing them would create an
// expert named after a UI screen.
const RESERVED_HANDLES = new Set(['i', 'home', 'explore', 'search', 'notifications', 'messages', 'settings', 'intent', 'share', 'compose', 'login', 'signup'])

export function xUsername(url: string): string {
    const bare = url.trim().match(/^@?([A-Za-z0-9_]{1,15})$/)
    const username = url.match(/(?:x|twitter)\.com\/(?:#!\/)?@?([A-Za-z0-9_]{1,15})/i)?.[1] ?? bare?.[1]
    if (!username || RESERVED_HANDLES.has(username.toLowerCase())) throw new Error(`Not an X profile URL: ${url}`)
    return username
}

export function canonicalXUrl(username: string): string {
    return `https://x.com/${username}`
}

export async function scrapeXProfile(url: string): Promise<RawXProfile> {
    const username = xUsername(url)
    const actor = process.env.APIFY_X_PROFILE_ACTOR ?? DEFAULT_PROFILE_ACTOR
    const [profile] = await runApifyActor<RawXUser>(actor, { twitterHandles: [username], getFollowers: false, getFollowing: false, maxItems: 1 }, 1)
    if (!profile) throw new Error(`Apify returned no X profile for @${username}`)
    return { profile, tweets: await scrapeTweets(username) }
}

async function scrapeTweets(username: string): Promise<XTweet[]> {
    try {
        const actor = process.env.APIFY_X_TWEETS_ACTOR ?? DEFAULT_TWEETS_ACTOR
        const items = await runApifyActor<Record<string, unknown>>(actor, { twitterHandles: [username], maxItems: MAX_TWEETS, sort: 'Latest' }, MAX_TWEETS)
        return items.map(toTweet).filter(tweet => tweet.text.length > 0)
    } catch {
        return []
    }
}

function toTweet(item: Record<string, unknown>): XTweet {
    const body = typeof item.fullText === 'string' ? item.fullText : typeof item.text === 'string' ? item.text : ''
    return {
        text: body.slice(0, MAX_TWEET_LENGTH),
        createdAt: typeof item.createdAt === 'string' ? item.createdAt : undefined,
        likeCount: typeof item.likeCount === 'number' ? item.likeCount : undefined,
        retweetCount: typeof item.retweetCount === 'number' ? item.retweetCount : undefined,
        isReply: typeof item.isReply === 'boolean' ? item.isReply : undefined,
        isRetweet: typeof item.isRetweet === 'boolean' ? item.isRetweet : undefined,
    }
}

// X serves avatars as a 48px `_normal` thumbnail; the `_400x400` variant of the same object is
// always generated and is what we want before the 512px re-encode.
export function extractXPhotoUrl(profile: RawXProfile): string | null {
    const candidate = profile.profile.profilePicture
    if (typeof candidate !== 'string' || !candidate.startsWith('http')) return null
    return candidate.replace(/_(normal|bigger|mini|200x200)\.(jpg|jpeg|png|webp)$/i, '_400x400.$2')
}

// A profile_banners URL takes an optional trailing size; pinning the native 1500x500 avoids
// depending on whichever default X decides to serve for the bare URL.
export function extractXBannerUrl(profile: RawXProfile): string | null {
    const candidate = profile.profile.coverPicture
    if (typeof candidate !== 'string' || !candidate.startsWith('http')) return null
    return /\/profile_banners\/\d+\/\d+\/?$/.test(candidate) ? `${candidate.replace(/\/$/, '')}/1500x500` : candidate
}
