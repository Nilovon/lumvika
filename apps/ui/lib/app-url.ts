export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.lumvika.com'

// The board reads it once hydrated and opens the conversation the notification is about.
export function notificationUrl(notificationId: string): string {
    return `${APP_URL}/?notification=${encodeURIComponent(notificationId)}`
}
