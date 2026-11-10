import { task } from '@trigger.dev/sdk/v3'

import { findWorkspaceEngine } from '@/app/api/_services/workspace-engine.service'
import { taskLogger as logger, triggerTaskAndWait, waitMinutes as waitFor } from '@lumvika/cloud/tasks'
import { companyExploreIdempotencyKey, companyExploreKey, requestAgentIdeas } from '@/lib/brain/request-seed'
import { buildSeedPages } from '@/lib/brain/seed-pages'
import { companySiteUrl } from '@/lib/company/firecrawl'
import { workEmailSite } from '@/lib/company/work-email-site'
import { EngineRequestError, seedBrain } from '@/lib/engine/client'
import { createServiceRoleClient } from '@/supabase/serviceRole'
import { readAnswers, readSignup, type exploreCompanyTask } from './explore-company'

// `exploreKey` asks for a new exploration, the brain's "read my website again". Without it the seed
// takes the one the onboarding started for this site, waiting for it if it is still running.
export type SeedCompanyBrainPayload = { workspaceId: number; exploreKey?: string }

// A box claimed before its engine learnt /brain/seed answers 404 until its next self-update, and
// one restarting answers nothing. The exploration is not redone for that: it costs Firecrawl
// credits, Apify runs and a model call, so only the seed call waits and tries again.
const SEED_RETRY_WAITS_MINUTES = [2, 5, 15, 30]

function isRetriable(error: unknown): boolean {
    if (!(error instanceof EngineRequestError)) return true
    return error.status === 404 || error.status >= 500
}

// Off the one-at-a-time exploration queue: it no longer reads anything itself, and holding that slot
// while waiting on an exploration from the same queue would never end.
export const seedCompanyBrain = task({
    id: 'seed-company-brain',
    // The exploration it waits on and the waits between seed attempts are checkpointed and do not count.
    maxDuration: 300,
    // Retries happen inside the run, around the seed call only: a run-level retry would explore
    // the company again.
    retry: { maxAttempts: 1 },
    run: (payload: SeedCompanyBrainPayload) => seedCompanyBrainRun(payload),
})

export async function seedCompanyBrainRun({ workspaceId, exploreKey }: SeedCompanyBrainPayload) {
    const supabase = createServiceRoleClient()
    const answers = await readAnswers(supabase, workspaceId)

    // A sign-up that skipped the website still names its company in a work address: without it,
    // every coworker starts on an empty Brain and asks what the company sells.
    const url = (answers.company_url ? companySiteUrl(answers.company_url) : null) ?? workEmailSite((await readSignup(supabase, workspaceId)).email)
    if (!url) {
        logger.log('brain seed: no company website, nothing to explore', { workspaceId })
        return null
    }

    const engine = await findWorkspaceEngine(workspaceId)
    if (!engine) {
        logger.log('brain seed: workspace has no machine', { workspaceId })
        return null
    }

    const explored = await triggerTaskAndWait<typeof exploreCompanyTask>(
        'explore-company',
        { workspaceId, url },
        { idempotencyKey: await companyExploreIdempotencyKey(exploreKey ?? companyExploreKey(workspaceId, url)) }
    )
    const synthesis = explored.ok ? explored.output : null
    if (!synthesis) {
        logger.warn('brain seed: the synthesis produced nothing, no page written', { workspaceId, url })
        return null
    }

    const pages = buildSeedPages({ card: synthesis.card, brief: synthesis.brief, steward: answers.steward, catalog: synthesis.catalog ?? null })
    if (!pages.length) {
        logger.warn('brain seed: the card filled no page', { workspaceId, url })
        return null
    }

    for (let attempt = 0; ; attempt++) {
        try {
            const result = await seedBrain(engine.conn, pages)
            logger.log('brain seed: done', { workspaceId, url, model: synthesis.model, written: result.written, skipped: result.skipped })
            await requestAgentIdeas(workspaceId, exploreKey ?? companyExploreKey(workspaceId, url))
            return { written: result.written.length, skipped: result.skipped.length }
        } catch (error) {
            const waitMinutes = SEED_RETRY_WAITS_MINUTES[attempt]
            if (!isRetriable(error) || waitMinutes === undefined) throw error
            logger.warn('brain seed: engine not ready, waiting', {
                workspaceId,
                attempt: attempt + 1,
                waitMinutes,
                status: error instanceof EngineRequestError ? error.status : null,
                error: error instanceof Error ? error.message : String(error),
            })
            await waitFor(waitMinutes)
        }
    }
}
