import { z } from 'zod'

// What Lumvika reads in a job description as it is typed: the name the agent could carry, the apps
// the job needs, and when it runs. `source` is the passage the timing was read from, which the
// field underlines; null when the model reworded it past recognition.
export type JobSchedule = { label: string; source: string | null }
export type JobReading = { name: string | null; apps: string[]; schedule: JobSchedule | null }

export const EMPTY_READING: JobReading = { name: null, apps: [], schedule: null }

// Under this many characters there is nothing to read yet, and no call is worth making.
export const MIN_READABLE_LENGTH = 12
export const MAX_READABLE_LENGTH = 500
// Each app is installed in turn when the tile is dropped, so every one of them is a wait.
export const MAX_APPS_AT_CREATION = 6

// One bound for the name at creation, whoever writes it: the model, the user in the pill, or the
// landing page's query string.
export const AGENT_NAME_MAX = 60

const MAX_READ_APPS = 5
const MAX_LABEL_LENGTH = 60

const replySchema = z.object({
    name: z.string().nullish(),
    apps: z.array(z.unknown()).nullish(),
    schedule: z.object({ label: z.string().nullish(), source: z.string().nullish() }).nullish(),
})

// The reply is a model's: it may come wrapped in prose or a code fence, name an app the catalogue
// does not have, or spell a slug its own way. Whatever cannot be trusted is dropped, and a reply
// that is not JSON at all reads as nothing rather than as an error.
export function parseJobReading(reply: string, text: string, catalogSlugs: string[]): JobReading {
    const json = reply.match(/\{[\s\S]*\}/)?.[0]
    if (!json) return EMPTY_READING

    let raw: unknown
    try {
        raw = JSON.parse(json)
    } catch {
        return EMPTY_READING
    }
    const parsed = replySchema.safeParse(raw)
    if (!parsed.success) return EMPTY_READING

    const bySlug = new Map(catalogSlugs.map(slug => [slug.toLowerCase(), slug]))
    const apps = (parsed.data.apps ?? []).flatMap(app => {
        const slug = typeof app === 'string' ? bySlug.get(app.trim().toLowerCase()) : undefined
        return slug ? [slug] : []
    })

    return {
        name: parsed.data.name?.trim().slice(0, AGENT_NAME_MAX) || null,
        apps: [...new Set(apps)].slice(0, MAX_READ_APPS),
        schedule: readSchedule(parsed.data.schedule, text),
    }
}

function readSchedule(schedule: { label?: string | null; source?: string | null } | null | undefined, text: string): JobSchedule | null {
    const label = schedule?.label?.trim().slice(0, MAX_LABEL_LENGTH)
    if (!label) return null
    return { label, source: sourceIn(text, schedule?.source) }
}

// The passage as the description spells it, so the underline lands on the user's own characters.
function sourceIn(text: string, source: string | null | undefined): string | null {
    const wanted = source?.trim()
    if (!wanted) return null
    const at = text.toLowerCase().indexOf(wanted.toLowerCase())
    return at < 0 ? null : text.slice(at, at + wanted.length)
}
