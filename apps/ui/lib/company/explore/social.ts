export const SOCIAL_NETWORKS = ['linkedin', 'instagram', 'x', 'facebook', 'youtube', 'tiktok', 'github', 'pinterest', 'threads'] as const
export type SocialNetwork = (typeof SOCIAL_NETWORKS)[number]
export type SocialProfiles = Partial<Record<SocialNetwork, string>>

// Company-level profiles only: a share button, a single post or a person's page is not where the
// company lives.
const PROFILE_PATTERNS: Record<SocialNetwork, RegExp> = {
    linkedin: /^https?:\/\/([a-z]{2,3}\.)?(www\.)?linkedin\.com\/(company|school|showcase)\/[^/?#]+/i,
    instagram: /^https?:\/\/(www\.)?instagram\.com\/(?!p\/|reel\/|explore\/|accounts\/)[a-z0-9._]+\/?(?:[?#]|$)/i,
    x: /^https?:\/\/(www\.)?(twitter|x)\.com\/(?!intent\/|share|home|search|hashtag\/|i\/)[a-z0-9_]+\/?(?:[?#]|$)/i,
    facebook: /^https?:\/\/([a-z-]+\.)?facebook\.com\/(?!sharer|share|dialog\/|plugins\/|tr\b)[^/?#]+\/?(?:[?#]|$)/i,
    youtube: /^https?:\/\/(www\.)?youtube\.com\/(@[^/?#]+|channel\/[^/?#]+|c\/[^/?#]+|user\/[^/?#]+)/i,
    tiktok: /^https?:\/\/(www\.)?tiktok\.com\/@[^/?#]+/i,
    github: /^https?:\/\/(www\.)?github\.com\/[a-z0-9-]+\/?(?:[?#]|$)/i,
    pinterest: /^https?:\/\/([a-z]{2}\.)?(www\.)?pinterest\.[a-z.]+\/(?!pin\/)[^/?#]+\/?(?:[?#]|$)/i,
    threads: /^https?:\/\/(www\.)?threads\.(net|com)\/@[^/?#]+/i,
}

export function socialProfiles(urls: string[]): SocialProfiles {
    const profiles: SocialProfiles = {}
    for (const url of urls) {
        for (const network of SOCIAL_NETWORKS) {
            if (profiles[network]) continue
            const match = url.match(PROFILE_PATTERNS[network])
            if (match) profiles[network] = match[0].replace(/[?#]$/, '')
        }
    }
    return profiles
}

export function linkedinPeople(urls: string[]): string[] {
    const people = urls.map(url => url.match(/^https?:\/\/([a-z]{2,3}\.)?(www\.)?linkedin\.com\/in\/[^/?#]+/i)?.[0]).filter((url): url is string => Boolean(url))
    return [...new Set(people)]
}

function foldAccents(text: string): string {
    return text
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
}

// True when every word of the name shows up in the text, accents and case aside. Loose on
// purpose: "Hélène Dubois" has to match the slug "helenedubois" as well as a page title.
export function mentionsName(text: string, name: string): boolean {
    const haystack = foldAccents(text).replace(/[^a-z0-9]/g, '')
    const words = foldAccents(name)
        .split(/[^a-z0-9]+/)
        .filter(word => word.length > 1)
    return words.length > 0 && words.every(word => haystack.includes(word))
}

// "acme" for acme.co.uk, "doctolib" for www.doctolib.fr: a stand-in name for the queries that run
// before anything has told us what the company calls itself.
export function domainLabel(domain: string): string {
    return domain.replace(/^www\./, '').split('.')[0]
}

// Whether a URL some third party lists for the company (LinkedIn, Google) points to the site we
// were given: the cheapest way to tell the company from a namesake.
export function pointsToDomain(url: string | null | undefined, domain: string): boolean {
    if (!url) return false
    try {
        return new URL(url).hostname.replace(/^www\./, '').endsWith(domain.replace(/^www\./, ''))
    } catch {
        return false
    }
}
