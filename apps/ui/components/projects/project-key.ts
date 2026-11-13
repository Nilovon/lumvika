import { PROJECT_KEY_PATTERN } from '@lumvika/contracts'

const MAX_KEY_LENGTH = 6
const MAX_INITIALS = 4
const SINGLE_WORD_LENGTH = 3

function wordsOf(name: string): string[] {
    return name
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toUpperCase()
        .split(/[^A-Z0-9]+/)
        .filter(Boolean)
}

// The key a project's name suggests: the initials of a name of several words (Customer Support ->
// CS), the first letters of a single word (Engineering -> ENG). It starts with a letter and holds
// at least two characters, and a key already taken gets a number (ENG2) rather than a clash.
export function suggestProjectKey(name: string, takenKeys: Iterable<string> = []): string {
    const words = wordsOf(name)
    const firstLetterAt = words.findIndex(word => /^[A-Z]/.test(word))
    if (firstLetterAt === -1) return ''
    const usable = words.slice(firstLetterAt)

    let base = usable.length > 1 ? usable.slice(0, MAX_INITIALS).map(word => word[0]).join('') : usable[0].slice(0, SINGLE_WORD_LENGTH)
    if (base.length < 2) base = usable.join('').slice(0, SINGLE_WORD_LENGTH)
    if (base.length < 2) base = `${base}X`.slice(0, 2)

    const taken = new Set([...takenKeys].map(key => key.toUpperCase()))
    if (!taken.has(base)) return base
    for (let suffix = 2; suffix < 100; suffix++) {
        const candidate = `${base.slice(0, MAX_KEY_LENGTH - String(suffix).length)}${suffix}`
        if (!taken.has(candidate)) return candidate
    }
    return base
}

// What a person typed, as a key reads: capitals, no spaces nor symbols, six characters at most.
export function normalizeProjectKey(typed: string): string {
    return typed
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, MAX_KEY_LENGTH)
}

export function isValidProjectKey(key: string): boolean {
    return PROJECT_KEY_PATTERN.test(key)
}
