// No paid apps in this build: a service the catalog marks as one never installs.
export type AppSlug = string

export const APP_SLUGS: readonly AppSlug[] = []

export function isAppSlug(_value: string | null | undefined): _value is AppSlug {
    return false
}
