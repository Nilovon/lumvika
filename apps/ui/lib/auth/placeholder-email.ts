import { parsePhoneNumberFromString } from 'libphonenumber-js/min'

// Phone sign-in is gone, but accounts it opened were filed under an address on this subdomain, which
// has no mail server and never will: every reader of an account's email goes through `realEmail` or
// `accountLabel`.
const PLACEHOLDER_DOMAIN = 'phone.lumvika.com'
const PLACEHOLDER_PATTERN = new RegExp(`^(\\d+)@${PLACEHOLDER_DOMAIN.replaceAll('.', '\\.')}$`)

// `phone` is E.164: its digits make the address unique to the number.
export const placeholderEmailFor = (phone: string) => `${phone.replace(/\D/g, '')}@${PLACEHOLDER_DOMAIN}`

export const isPlaceholderEmail = (email: string | null | undefined) => !!email && PLACEHOLDER_PATTERN.test(email.toLowerCase())

// A deleted account keeps its row, filed under an address on another dead subdomain: the one it
// had is free again for a new signup.
const DELETED_ACCOUNT_DOMAIN = 'deleted.lumvika.com'

export const deletedAccountEmailFor = (userId: string) => `${userId}@${DELETED_ACCOUNT_DOMAIN}`

export const isDeletedAccountEmail = (email: string | null | undefined) => !!email && email.toLowerCase().endsWith(`@${DELETED_ACCOUNT_DOMAIN}`)

// An anonymous visitor's row carries an address on a reserved domain until they claim a real one.
// Mirrors `ANONYMOUS_EMAIL_DOMAIN` of the auth layer, which client code cannot import.
const ANONYMOUS_ACCOUNT_DOMAIN = 'anonymous.lumvika.invalid'

export const isAnonymousAccountEmail = (email: string | null | undefined) => !!email && email.toLowerCase().endsWith(`@${ANONYMOUS_ACCOUNT_DOMAIN}`)

export const realEmail = (email: string | null | undefined) => (email && !isPlaceholderEmail(email) && !isDeletedAccountEmail(email) && !isAnonymousAccountEmail(email) ? email : null)

// The number an account born from a phone signed up with, in E.164.
export function placeholderPhone(email: string | null | undefined): string | null {
    const digits = email ? PLACEHOLDER_PATTERN.exec(email.toLowerCase())?.[1] : undefined
    return digits ? `+${digits}` : null
}

// What stands for the account on screen: its address, or the number it signed up with.
export function accountLabel(email: string | null | undefined): string | null {
    if (!email) return null
    if (isDeletedAccountEmail(email)) return 'Deleted account'
    const phone = placeholderPhone(email)
    if (!phone) return email
    return parsePhoneNumberFromString(phone)?.formatInternational() ?? phone
}

// Apple's Hide My Email hands out a real, working address whose front is a random string.
export const isAppleRelayEmail = (email: string | null | undefined) => !!email && email.toLowerCase().endsWith('@privaterelay.appleid.com')
