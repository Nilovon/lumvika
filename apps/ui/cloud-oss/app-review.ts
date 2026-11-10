// The door Apple's App Review signs in through belongs to the iOS app of Rerun Cloud: a self-hosted
// hub has none.
export function isAppReviewNumber(_phone: string): boolean {
    return false
}

export function isAppReviewSignIn(_phone: string, _code: string): boolean {
    return false
}
