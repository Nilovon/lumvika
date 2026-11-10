export type ExpertSource = 'linkedin' | 'x'

// Pasted lines are tolerated without a scheme ("linkedin.com/in/jane"), but the source is decided
// on the parsed hostname rather than a substring match, so "https://evil.com/x.com" is not an X URL.
export function normalizeProfileUrl(raw: string): string | null {
    const trimmed = raw.trim()
    if (!trimmed) return null
    const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
    try {
        return new URL(candidate).toString()
    } catch {
        return null
    }
}

export function detectExpertSource(url: string): ExpertSource | null {
    let host: string
    try {
        host = new URL(url).hostname.toLowerCase().replace(/^(www|mobile|m)\./, '')
    } catch {
        return null
    }
    if (host === 'linkedin.com' || host.endsWith('.linkedin.com')) return 'linkedin'
    if (host === 'x.com' || host === 'twitter.com') return 'x'
    return null
}
