import { BRAIN_SLUG_RE } from '@lumvika/contracts'

const WIKILINK = /\[\[([^\]|#\n]+)(?:#[^\]|\n]*)?(?:\|[^\]\n]*)?\]\]/g

// Obsidian syntax: [[slug]], [[slug|label]] and [[slug#heading]] all point at the page `slug`.
// A target that is not a valid slug is someone's prose in brackets, not a link.
export function parseLinks(content: string, self?: string): string[] {
    const found = new Set<string>()
    for (const match of content.matchAll(WIKILINK)) {
        const target = match[1].trim().toLowerCase()
        if (target !== self && BRAIN_SLUG_RE.test(target)) found.add(target)
    }
    return [...found]
}
