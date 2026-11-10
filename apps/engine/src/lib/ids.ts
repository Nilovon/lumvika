import { customAlphabet } from 'nanoid'

const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz'

export const newId = customAlphabet(alphabet, 21)

export function slugify(input: string): string {
    return input
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64)
}

export const nowIso = () => new Date().toISOString()
