import matter from 'gray-matter'

const KEY_LINE = /^([\w.-]+):[ \t]*(.*)$/

const strictYaml = (matter as unknown as { engines: { yaml: { parse: (str: string, options?: unknown) => object } } }).engines.yaml.parse

function unquote(value: string): string {
    const trimmed = value.trim()
    if (trimmed.length < 2) return trimmed
    const quote = trimmed[0]!
    if ((quote === '"' || quote === "'") && trimmed.endsWith(quote)) return trimmed.slice(1, -1)
    return trimmed
}

function parseFlatFrontmatter(block: string): Record<string, string> {
    const data: Record<string, string> = {}
    let key: string | null = null
    for (const line of block.split('\n')) {
        if (!line.trim() || line.trimStart().startsWith('#')) {
            key = null
            continue
        }
        const match = KEY_LINE.exec(line)
        if (match) {
            key = match[1]!
            data[key] = unquote(match[2]!)
            continue
        }
        if (key) data[key] = `${data[key]} ${line.trim()}`.trim()
    }
    return data
}

function tolerantYaml(block: string, options?: unknown): object {
    try {
        return strictYaml(block, options)
    } catch {
        return parseFlatFrontmatter(block)
    }
}

export function parseFrontmatter(content: string): { data: Record<string, unknown>; body: string } {
    const parsed = matter(content, { engines: { yaml: tolerantYaml } })
    return { data: parsed.data as Record<string, unknown>, body: parsed.content }
}
