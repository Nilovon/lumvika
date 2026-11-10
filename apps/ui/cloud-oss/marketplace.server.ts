import 'server-only'

// Templates are free here, so nothing waits on a creator's payout account.
export async function isPayoutReady(_creatorId: string | null | undefined): Promise<boolean> {
    return true
}
