import { parsePhoneNumberFromString } from 'libphonenumber-js/min'

// An account born from a phone number has no address to write to, and Supabase can only open a
// session for a user that has one. It is given this one, on a subdomain that has no mail server
// and never will: every reader of an account's email goes through `realEmail` or `accountLabel`.
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

export const realEmail = (email: string | null | undefined) => (email && !isPlaceholderEmail(email) && !isDeletedAccountEmail(email) ? email : null)

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
