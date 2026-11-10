import type { BrainSeedPage, BrainSeedResult } from '@rerun/contracts'
import { readPageFile, SEED_AUTHOR, seedOwnsPage, writePage } from './pages.js'

// Run again whenever the hub re-explores the company, so it may only touch what it wrote itself:
// a page a person edited, a proposal they accepted or a section they confirmed makes it theirs
// from then on.
export async function seedBrain(pages: BrainSeedPage[]): Promise<BrainSeedResult> {
    const written: string[] = []
    const skipped: string[] = []
    for (const page of pages) {
        const current = await readPageFile(page.slug)
        if (current && !seedOwnsPage(current)) {
            skipped.push(page.slug)
            continue
        }
        const saved = await writePage(page.slug, { ...page, baseHash: null, force: true, author: SEED_AUTHOR })
        if (current && saved.updatedAt === current.updatedAt) skipped.push(page.slug)
        else written.push(page.slug)
    }
    return { written, skipped }
}
