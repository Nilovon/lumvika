function readString(metadata: Record<string, unknown> | undefined, key: string): string {
    const value = metadata?.[key]
    return typeof value === 'string' ? value.trim() : ''
}

// The two account origins do not write the same key: our own sign-up posts `first_name`, while
// Google posts `given_name` alongside a `full_name`. Reading both shapes here, and falling back to
// the front of a full name, is what lets the onboarding skip the question for someone we know.
//
// Kept out of `lib/onboarding/user-name.ts`, which is a client module: the naming service reads the
// same metadata server side, and importing it from there would pull a client module into the server
// graph.
export function readFirstName(metadata: Record<string, unknown> | undefined): string {
    const firstName = readString(metadata, 'first_name') || readString(metadata, 'given_name')
    if (firstName) return firstName

    const full = readString(metadata, 'full_name') || readString(metadata, 'name')
    return full.split(/\s+/)[0] ?? ''
}
