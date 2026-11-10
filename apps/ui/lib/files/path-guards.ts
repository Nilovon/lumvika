// The store resolves the path again under its own root, but a name that carries a separator would
// silently land in another directory, so it is refused here rather than reinterpreted.
export function invalidName(name: string): boolean {
    return !name || name.includes('/') || name.includes('\\') || name === '..' || new TextEncoder().encode(name).length > 255
}

export function invalidDir(dir: string): boolean {
    return dir.startsWith('/') || dir.split(/[/\\]/).includes('..')
}
