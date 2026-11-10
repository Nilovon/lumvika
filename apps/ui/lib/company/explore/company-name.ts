import type { SiteFindings } from './site'
import { domainLabel } from './social'
import type { StackFindings } from './stack'
import type { ExploreInput } from './types'

const GENERIC_TITLE_PARTS = /^(home|accueil|homepage|welcome|bienvenue|page d'accueil)$/i

const squash = (text: string) =>
    text
        .normalize('NFD')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')

// "Home | Acme", "Acme - Book a demo" and ". x X    Acme    X x ." all name Acme: the part that is
// not boilerplate and overlaps the domain wins.
export function nameFromTitle(title: string, domain: string): string | null {
    const label = squash(domainLabel(domain))
    const parts = title
        .split(/\s[|–—\-:·•]\s|\s{2,}/)
        .map(part => part.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').trim())
        .filter(part => squash(part).length > 1 && !GENERIC_TITLE_PARTS.test(part))
    if (!parts.length) return null
    return parts.find(part => label.includes(squash(part)) || squash(part).includes(label)) ?? parts[0]
}

// The best name we have before the synthesis has read anything: what the site calls itself, then
// the domain.
export function companyNameGuess(input: ExploreInput, stack: StackFindings | null, site: SiteFindings | null): string {
    const title = stack?.meta.title ?? site?.pages.find(page => page.category === 'home')?.title
    const siteName = stack?.meta.siteName
    return (siteName ? nameFromTitle(siteName, input.domain) : null) ?? (title ? nameFromTitle(title, input.domain) : null) ?? domainLabel(input.domain)
}
