import { logger, queue, schedules, task } from '@trigger.dev/sdk/v3'
import { sweepTrialSequence } from '@/lib/whatsapp/trial-sequence'
import { serviceScope } from '@/lib/db'

type TrialSequencePayload = {
    // Narrows the whole sweep to a few workspaces, for trying the messages end to end.
    workspaceIds?: number[]
}

const trialSequenceQueue = queue({ name: 'whatsapp-trial-sequence', concurrencyLimit: 1 })

async function sweep(payload: TrialSequencePayload) {
    const report = await sweepTrialSequence(serviceScope(), new Date(), payload.workspaceIds)
    logger.log('whatsapp trial sequence sweep', report)
    return report
}

export const whatsappTrialSequenceSweep = task({
    id: 'whatsapp-trial-sequence-sweep',
    queue: trialSequenceQueue,
    maxDuration: 600,
    retry: { maxAttempts: 1 },
    run: async (payload: TrialSequencePayload) => sweep(payload),
})

export const whatsappTrialSequenceSchedule = schedules.task({
    id: 'whatsapp-trial-sequence-every-15-min',
    cron: '9,24,39,54 * * * *',
    queue: trialSequenceQueue,
    maxDuration: 600,
    // The next tick is the retry: a message that left is already on its row.
    retry: { maxAttempts: 1 },
    run: async (_payload, { ctx }) => {
        // A local `pnpm trigger:dev` session may point at a copy of production data, and would
        // otherwise read real accounts every fifteen minutes.
        if (ctx.environment.type === 'DEVELOPMENT') {
            logger.log('whatsapp trial sequence: skipped, dev environment')
            return null
        }
        // Staging runs on a clone of production, where every number is a real person's.
        if (ctx.environment.type !== 'PRODUCTION' && !process.env.WHATSAPP_REDIRECT_TO) {
            logger.error('whatsapp trial sequence: skipped, WHATSAPP_REDIRECT_TO is not set outside production')
            return null
        }
        return sweep({})
    },
})
