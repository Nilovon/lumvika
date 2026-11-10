// Maps a request path on a published site onto one of its files, the way a static host does:
// `/` is index.html, `/about` is about, about.html or about/index.html. Returns the file's index
// in the manifest, since that index is what its Storage key is built from.
export function resolveSitePath(segments: readonly string[], files: readonly string[]): number | null {
    const parts = segments.filter(Boolean)
    if (parts.some(part => part === '.' || part === '..' || part.includes('\\'))) return null

    const path = parts.join('/')
    const candidates = path === '' ? ['index.html'] : [path, `${path}.html`, `${path}/index.html`]
    for (const candidate of candidates) {
        const index = files.indexOf(candidate)
        if (index !== -1) return index
    }
    return null
}

export function siteObjectKey(prefix: string, index: number): string {
    return `${prefix}/${index}`
}
