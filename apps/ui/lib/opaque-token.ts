// 32 characters, so a random byte maps onto them without modulo bias (256 = 8 x 32), and none of
// them can be misread out loud: no `l`, no `o`, no `0`, no `1`.
const TOKEN_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'

// A URL that is the capability itself, so length is the whole security argument: 10 characters for
// a published file that only reveals its own bytes, 32 for a share link that installs an agent.
export function opaqueToken(length: number): string {
    const bytes = new Uint8Array(length)
    crypto.getRandomValues(bytes)
    let token = ''
    for (const byte of bytes) token += TOKEN_ALPHABET[byte % TOKEN_ALPHABET.length]
    return token
}

export function isOpaqueToken(value: string, length: number): boolean {
    return value.length === length && [...value].every(char => TOKEN_ALPHABET.includes(char))
}
