// One builder per WhatsApp template, each owning the variables its Bird template declares. A
// template is authored and approved in Bird: the slug, the named body variables and the single URL
// button below have to match it exactly, or Bird refuses the send with a parameter mismatch.

// The only language with templates approved in Bird.
export type WhatsAppLanguage = 'en'

export type WhatsAppCategory = 'marketing' | 'utility'

export const WHATSAPP_TEMPLATES = {
    access_ends_recap: { slug: 'lumvika_access_ends_coworker', category: 'marketing' },
    access_ends_help: { slug: 'lumvika_access_ends_help', category: 'marketing' },
    payment_failed: { slug: 'lumvika_payment_failed', category: 'utility' },
    trial_first_job_done: { slug: 'lumvika_trial_first_job_done', category: 'marketing' },
    trial_morning_report: { slug: 'lumvika_trial_morning_report', category: 'marketing' },
    trial_no_first_job: { slug: 'lumvika_trial_no_first_job', category: 'marketing' },
    trial_idea_for_you: { slug: 'lumvika_trial_idea_for_you', category: 'marketing' },
    trial_anything_blocking: { slug: 'lumvika_trial_anything_blocking', category: 'marketing' },
    trial_needs_your_ok: { slug: 'lumvika_trial_needs_your_ok', category: 'marketing' },
    trial_week_recap: { slug: 'lumvika_trial_week_recap', category: 'marketing' },
} as const satisfies Record<string, { slug: string; category: WhatsAppCategory }>

export type WhatsAppTemplateKey = keyof typeof WHATSAPP_TEMPLATES
export const WHATSAPP_TEMPLATE_KEYS = Object.keys(WHATSAPP_TEMPLATES) as WhatsAppTemplateKey[]

export type WhatsAppParameter = { type: 'text'; text: string; name?: string } | { type: 'image'; url: string }
export type WhatsAppComponent = { type: 'header' | 'body' | 'button'; parameters: WhatsAppParameter[] }

export type WhatsAppMessage = {
    key: WhatsAppTemplateKey
    slug: string
    category: WhatsAppCategory
    components: WhatsAppComponent[]
}

const MAX_PARAMETER_LENGTH = 300

// Meta refuses a variable holding a line break, a tab or a run of spaces, and the values here are
// written by agents and users.
function inline(value: string): string {
    const flat = value.replace(/\s+/g, ' ').trim()
    return flat.length > MAX_PARAMETER_LENGTH ? `${flat.slice(0, MAX_PARAMETER_LENGTH - 1).trimEnd()}…` : flat
}

type Parts = { imageUrl?: string; body?: Record<string, string>; path: string }

// Every visit a message brings back is told apart in PostHog by these two, read off `$current_url`.
// A `ref` the caller already set (the admin test sends) is kept.
function trackedPath(path: string, key: WhatsAppTemplateKey): string {
    const [pathname, query = ''] = path.replace(/^\/+/, '').split('?')
    const params = new URLSearchParams(query)
    if (!params.has('ref')) params.set('ref', 'whatsapp')
    params.set('wa', key)
    return `${pathname}?${params}`
}

// Every template ends on one button whose URL is `https://app.lumvika.com/{{1}}`, so the variable is
// a path without its leading slash.
function build(key: WhatsAppTemplateKey, { imageUrl, body, path }: Parts): WhatsAppMessage {
    const components: WhatsAppComponent[] = []
    if (imageUrl) components.push({ type: 'header', parameters: [{ type: 'image', url: imageUrl }] })
    if (body) components.push({ type: 'body', parameters: Object.entries(body).map(([name, text]) => ({ type: 'text', name, text: inline(text) })) })
    components.push({ type: 'button', parameters: [{ type: 'text', text: trackedPath(path, key) }] })
    return { key, ...WHATSAPP_TEMPLATES[key], components }
}

// Every message of the trial and the access-ending recap speak as a coworker, and open on the
// person's first name. Without one, "Hey" reads right at the head of each of their hooks.
const NAMELESS_GREETING = 'Hey'

function greeting(firstName: string | null): string {
    return firstName?.trim() || NAMELESS_GREETING
}

type CoworkerVoice = { imageUrl: string; firstName: string | null; path: string }

export function accessEndsRecapMessage(input: CoworkerVoice & { taskCount: number }): WhatsAppMessage {
    return build('access_ends_recap', { imageUrl: input.imageUrl, body: { first_name: greeting(input.firstName), task_count: String(input.taskCount) }, path: input.path })
}

export function accessEndsHelpMessage(input: { imageUrl: string; path: string }): WhatsAppMessage {
    return build('access_ends_help', { imageUrl: input.imageUrl, path: input.path })
}

export function paymentFailedMessage(input: { imageUrl: string; team: string; path: string }): WhatsAppMessage {
    return build('payment_failed', { imageUrl: input.imageUrl, body: { team: input.team }, path: input.path })
}

export function trialFirstJobDoneMessage(input: CoworkerVoice & { result: string }): WhatsAppMessage {
    return build('trial_first_job_done', { imageUrl: input.imageUrl, body: { first_name: greeting(input.firstName), result: input.result }, path: input.path })
}

export function trialMorningReportMessage(input: CoworkerVoice & { result: string; teaser: string }): WhatsAppMessage {
    return build('trial_morning_report', { imageUrl: input.imageUrl, body: { first_name: greeting(input.firstName), result: input.result, teaser: input.teaser }, path: input.path })
}

export function trialNoFirstJobMessage(input: CoworkerVoice & { coworker: string }): WhatsAppMessage {
    return build('trial_no_first_job', { imageUrl: input.imageUrl, body: { first_name: greeting(input.firstName), coworker: input.coworker }, path: input.path })
}

export function trialIdeaForYouMessage(input: CoworkerVoice & { company: string; idea: string }): WhatsAppMessage {
    return build('trial_idea_for_you', { imageUrl: input.imageUrl, body: { first_name: greeting(input.firstName), company: input.company, idea: input.idea }, path: input.path })
}

export function trialAnythingBlockingMessage(input: CoworkerVoice & { lastDay: string }): WhatsAppMessage {
    return build('trial_anything_blocking', { imageUrl: input.imageUrl, body: { first_name: greeting(input.firstName), last_day: input.lastDay }, path: input.path })
}

export function trialNeedsYourOkMessage(input: CoworkerVoice & { action: string }): WhatsAppMessage {
    return build('trial_needs_your_ok', { imageUrl: input.imageUrl, body: { first_name: greeting(input.firstName), action: input.action }, path: input.path })
}

export function trialWeekRecapMessage(input: CoworkerVoice & { taskCount: number }): WhatsAppMessage {
    return build('trial_week_recap', { imageUrl: input.imageUrl, body: { first_name: greeting(input.firstName), task_count: String(input.taskCount) }, path: input.path })
}

// How a message names the coworkers of a workspace. Two by name at most: a variable is one line of
// a phone screen, and a team of nine would fill the message with its roster.
export function teamLabel(names: string[]): string {
    if (names.length === 0) return 'your coworkers'
    if (names.length <= 2) return names.join(' and ')
    const others = names.length - 2
    return `${names[0]}, ${names[1]} and ${others} ${others === 1 ? 'other' : 'others'}`
}
