import { TRIAL_DAYS } from '@rerun/contracts'

export const site = {
    name: 'Rerun',
    title: 'Rerun | Get your tasks done by AI, even while you sleep',
    titleTemplate: '%s | Rerun',
    description:
        `Pick a ready-to-run AI agent from the library or build your own, connect your tools, and it runs 24/7 on your own private machine in the cloud. Free ${TRIAL_DAYS}-day trial.`,
    url: 'https://app.rerun.build',
    // Captured from `/render/brand/default`, so the card always matches the React stage. Relative on
    // purpose: `metadataBase` resolves it onto this host, which is the one that serves it.
    ogImage: '/og/brand/default',
    ogImageSize: { width: 2400, height: 1260 },
} as const

export function landingUrl(path: string): string {
    const base = (process.env.NEXT_PUBLIC_LANDING_URL ?? 'https://rerun.build').replace(/\/$/, '')
    return `${base}${path}`
}

export function docsUrl(path = ''): string {
    return `https://docs.rerun.build${path}`
}
