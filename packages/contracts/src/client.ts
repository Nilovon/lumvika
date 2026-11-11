import { z } from 'zod'

export const CLIENT_HEADER = 'x-lumvika-client'

export type ClientIdentity = { platform: 'ios'; version: string; build: number }

export function formatClientHeader({ platform, version, build }: ClientIdentity): string {
    return `${platform}/${version} (${build})`
}

// A binary older than minBuild cannot follow the hub any more and must be updated from the App Store.
export const clientConfigSchema = z.object({
    minBuild: z.number().int().nonnegative(),
})
export type ClientConfig = z.infer<typeof clientConfigSchema>
