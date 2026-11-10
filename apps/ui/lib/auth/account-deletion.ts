// What the user types to confirm deleting their account, checked again on the server so a call
// that skips the dialog deletes nothing.
export const DELETE_ACCOUNT_CONFIRMATION = 'DELETE'

// A workspace only this user is left in, whose subscription will still charge a card.
export type AccountDeletionBlocker = { workspaceId: number; name: string }
