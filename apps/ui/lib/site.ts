import { TRIAL_DAYS } from '@lumvika/contracts'

export const site = {
    name: 'Lumvika',
    title: 'Lumvika | Get your tasks done by AI, even while you sleep',
    titleTemplate: '%s | Lumvika',
    description:
        `Pick a ready-to-run AI agent from the library or build your own, connect your tools, and it runs 24/7 on your own private machine in the cloud. Free ${TRIAL_DAYS}-day trial.`,
    url: 'https://app.lumvika.com',
    // Captured from `/render/brand/default`, so the card always matches the React stage. Relative on
    // purpose: `metadataBase` resolves it onto this host, which is the one that serves it.
    ogImage: '/og/brand/default',
    ogImageSize: { width: 2400, height: 1260 },
} as const

export function landingUrl(path: string): string {
    const base = (process.env.NEXT_PUBLIC_LANDING_URL ?? 'https://lumvika.com').replace(/\/$/, '')
    return `${base}${path}`
}

export function docsUrl(path = ''): string {
    const base = (process.env.NEXT_PUBLIC_DOCS_URL || 'https://docs.lumvika.com').replace(/\/$/, '')
    return `${base}${path}`
}

// Where anyone using this install gets its source code (AGPL-3.0, section 13). A deployment that
// changes the code points this at its own repository.
export const SOURCE_REPO_URL = (process.env.NEXT_PUBLIC_SOURCE_REPO_URL || 'https://github.com/schnebel-technologie/lumvika').replace(/\/$/, '')
