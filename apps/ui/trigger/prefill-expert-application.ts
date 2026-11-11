import { task } from '@trigger.dev/sdk/v3'
import { taskLogger as logger } from '@lumvika/cloud/tasks'
import { prefillExpertFromProfile } from '@/lib/experts/prefill'
import { serviceScope } from '@/lib/db'
import { expertScrapeQueue } from './expert-queue'

type PrefillExpertApplicationPayload = { expertId: string }

// A creator application only carries what the candidate typed. This fills the rest of the fiche
// from their LinkedIn (or X) profile so the admin reviews something real and the candidate finds
// their profile already written when they claim their account. Async because the Apify run alone
// takes tens of seconds.
export const prefillExpertApplicationTask = task({
    id: 'prefill-expert-application',
    queue: expertScrapeQueue,
    maxDuration: 600,
    retry: { maxAttempts: 2, minTimeoutInMs: 2000, maxTimeoutInMs: 15000, factor: 2 },
    run: (payload: PrefillExpertApplicationPayload) => prefillExpertApplicationRun(payload),
})

export async function prefillExpertApplicationRun({ expertId }: PrefillExpertApplicationPayload) {
    const result = await prefillExpertFromProfile(serviceScope(), expertId)

    // Nothing to scrape is an outcome, not a failure: retrying would scrape the same nothing.
    if (!result.ok) {
        logger.info('expert prefill skipped', { expertId, reason: result.reason })
        return result
    }

    logger.info('expert prefilled', { expertId, slug: result.slug, source: result.source })
    return result
}
