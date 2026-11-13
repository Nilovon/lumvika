// An anonymous visitor only ever sees the board, where the Steward walks them in: the areas are for
// an account, and with the flag off they do not exist at all.
export function platformShellOpen({ platform, signedIn }: { platform: boolean; signedIn: boolean }): boolean {
    return platform && signedIn
}
