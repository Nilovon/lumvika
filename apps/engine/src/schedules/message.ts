import type { Schedule } from './loader.js'

const CLOSING_TAG = '</scheduled_run>'
const ESCAPED_CLOSING_TAG = '<\\/scheduled_run>'

function attr(value: string): string {
    return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;')
}

// The prompt is wrapped whole, so the chat can draw a scheduled run as a marker line instead of a
// message the user seems to have typed. The UI parser lives in apps/ui/lib/schedules/scheduled-run.ts.
export function buildScheduledRunMessage(schedule: Pick<Schedule, 'slug' | 'name' | 'body'>): string {
    const body = schedule.body.trim().replaceAll(CLOSING_TAG, ESCAPED_CLOSING_TAG)
    return `<scheduled_run schedule="${attr(schedule.slug)}" name="${attr(schedule.name)}">\n${body}\n${CLOSING_TAG}`
}
