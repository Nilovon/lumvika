import { logger, queue, schedules, task } from '@trigger.dev/sdk/v3'
import { sweepAccessEnding } from '@/lib/whatsapp/access-ending'
import { serviceScope } from '@/lib/db'

type AccessEndingPayload = {
    // Narrows the whole sweep to a few workspaces, for trying the message end to end.
    workspaceIds?: number[]
}

const accessEndingQueue = queue({ name: 'whatsapp-access-ending', concurrencyLimit: 1 })

async function sweep(payload: AccessEndingPayload) {
    const report = await sweepAccessEnding(serviceScope(), new Date(), payload.workspaceIds)
    logger.log('whatsapp access ending sweep', report)
    return report
}

export const whatsappAccessEndingSweep = task({
    id: 'whatsapp-access-ending-sweep',
    queue: accessEndingQueue,
    maxDuration: 300,
    retry: { maxAttempts: 1 },
    run: async (payload: AccessEndingPayload) => sweep(payload),
})

export const whatsappAccessEndingSchedule = schedules.task({
    id: 'whatsapp-access-ending-every-15-min',
    cron: '4,19,34,49 * * * *',
    queue: accessEndingQueue,
    maxDuration: 300,
    // The next tick is the retry: a message that left is already on its row.
    retry: { maxAttempts: 1 },
    run: async (_payload, { ctx }) => {
        // A local `pnpm trigger:dev` session may point at a copy of production data, and would
        // otherwise read real accounts every fifteen minutes.
        if (ctx.environment.type === 'DEVELOPMENT') {
            logger.log('whatsapp access ending: skipped, dev environment')
            return null
        }
        // Staging runs on a clone of production, where every number is a real person's.
        if (ctx.environment.type !== 'PRODUCTION' && !process.env.WHATSAPP_REDIRECT_TO) {
            logger.error('whatsapp access ending: skipped, WHATSAPP_REDIRECT_TO is not set outside production')
            return null
        }
        return sweep({})
    },
})
