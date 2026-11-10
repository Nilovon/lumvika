import { listSchedules } from '../../schedules/loader.js'
import { nextRunAt } from '../../schedules/cron.js'

export async function scheduleCommand(args: string[]): Promise<void> {
    const sub = args[0]
    if (sub === 'list') {
        const id = args[1]
        if (!id) throw new Error('Usage: rerun schedule list <agentId>')
        const now = new Date()
        const schedules = await listSchedules(id)
        for (const s of schedules) {
            const trigger = s.cron ? `cron ${s.cron}` : `once ${s.runAt}`
            const state = s.enabled ? `next ${nextRunAt(s, now) ?? 'never'}` : 'disabled'
            process.stdout.write(`${s.slug}\t${trigger}\t${state}\n`)
        }
        return
    }
    throw new Error('Usage: rerun schedule <list>')
}
