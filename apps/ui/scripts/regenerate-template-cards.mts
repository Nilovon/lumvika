// Recaptures the isogrid board of every template and stores the two images the cards serve, one per
// theme. This is the backfill for a catalogue written before the board became the thumbnail, and
// the gesture to repeat after changing the framing (CARD_MAX_ZOOM, CARD_BACKGROUND, the board
// itself): a stored capture never goes stale on its own.
//
// Run: ../engine/node_modules/.bin/tsx --env-file=.env scripts/regenerate-template-cards.mts [flags]
//
//   --apply              capture and write (without it, nothing is captured and nothing is written)
//   --slug=a,b           restrict to these slugs, whatever their status
//   --status=a,b         statuses to sweep, default published,unlisted
//   --all-statuses       every template, drafts and archives included
//   --missing            only templates whose pair is incomplete, to finish an interrupted run
//   --concurrency=N      templates captured in parallel, default 3
//
// Lumvika Shot loads the page in a browser of its own, so the two ends have to be able to reach each
// other. Against production, NEXT_PUBLIC_APP_URL and LUMVIKA_SHOT_URL are both the deployed services
// and there is nothing to set. Locally, both have to be local:
//
//   NEXT_PUBLIC_APP_URL=http://localhost:3050 LUMVIKA_SHOT_URL=http://localhost:4600 \
//     ../engine/node_modules/.bin/tsx --env-file=.env scripts/regenerate-template-cards.mts --apply
//
// The hosted screenshot service cannot see a laptop, which is what the preflight below is about.

import { schema, selectAll, serviceScope } from '@lumvika/db'
import type { Database } from '@lumvika/db/types'
import { captureTemplateCard } from '../lib/templates/card-render'

const apply = process.argv.includes('--apply')
const missingOnly = process.argv.includes('--missing')
const allStatuses = process.argv.includes('--all-statuses')
const slugs = listArg('slug')
const statuses = (listArg('status') ?? ['published', 'unlisted']).map(toStatus)
const concurrency = Number(flagArg('concurrency') ?? 3)

const TEMPLATE_COLUMNS = ['slug', 'title', 'status', 'agent_count', 'card_image_dark_url', 'card_image_light_url'] as const

// lib/og/shot.ts only falls back to a local Lumvika Shot when NODE_ENV says development, which a
// plain tsx run does not, so the default here is the hosted service.
const LOCAL_HOST = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
const shotUrl = process.env.LUMVIKA_SHOT_URL ?? 'https://shot.lumvika.com'

const scope = serviceScope()

// A slug list wins over a status filter, and --all-statuses over both: this script is as often
// pointed at one template being calibrated as at the whole catalogue.
const filter = slugs ? { slug: slugs } : allStatuses ? {} : { status: statuses }

const { data: rows, error: readError } = await selectAll(scope, 'templates', TEMPLATE_COLUMNS, filter, { column: 'slug', ascending: true })
if (readError || !rows) throw new Error(readError?.message ?? 'Failed to read the templates.')

// A template with no captured agent has no board to draw: the renderer would only null a pair that
// is already null, so it is left out of the count rather than reported as a no-op.
const withBoard = rows.filter(row => (row.agent_count ?? 0) > 0)
const targets = missingOnly ? withBoard.filter(row => !row.card_image_dark_url || !row.card_image_light_url) : withBoard

// Which database and which app, spelled out: `pnpm cloud env:staging` / `env:prod` swap them under the
// script's feet, and writing a catalogue into the wrong one is not something to discover after.
console.log(`Database : ${new URL(process.env.DATABASE_URL ?? 'postgres://unset').host}`)
console.log(`App      : ${appUrl || '(unset)'}`)
console.log(`Shot     : ${shotUrl}\n`)

console.log(`${targets.length} template(s) to capture${apply ? '' : ' (dry run, pass --apply)'}\n`)
for (const target of targets) {
    const pair = [target.card_image_dark_url && 'dark', target.card_image_light_url && 'light'].filter(Boolean)
    console.log(`  ${target.slug.padEnd(44)} ${target.status.padEnd(10)} ${pair.length === 0 ? 'aucune capture' : `déjà ${pair.join(' + ')}`}`)
}

if (!apply) {
    const skipped = rows.length - targets.length
    console.log(`\nNothing captured. ${skipped} row(s) skipped for having no captured agent${missingOnly ? ' or a complete pair' : ''}.`)
    process.exit(0)
}

// Pointing the hosted screenshot service at a localhost app answers ERR_CONNECTION_REFUSED from a
// machine in a datacentre, one failure per template, minutes into a run. Say it before the first one.
if (LOCAL_HOST.test(appUrl) && !LOCAL_HOST.test(shotUrl)) {
    throw new Error(`The app is ${appUrl}, which only a local Lumvika Shot can reach. Set LUMVIKA_SHOT_URL=http://localhost:4600 and run \`pnpm dev\` in lumvika-shot.`)
}

console.log('')
const failures: string[] = []
await mapWithConcurrency(targets, concurrency, async target => {
    const label = target.slug.padEnd(44)
    try {
        const { urls } = await captureTemplateCard(target.slug)
        console.log(`  ok    ${label} ${urls.dark ?? '—'}`)
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        failures.push(target.slug)
        console.log(`  FAIL  ${label} ${message}`)
    }
})

console.log(`\n${targets.length - failures.length} captured, ${failures.length} failed`)
if (failures.length > 0) console.log(`Retry with --slug=${failures.join(',')}`)
process.exit(failures.length === 0 ? 0 : 1)

function flagArg(name: string): string | undefined {
    return process.argv.find(arg => arg.startsWith(`--${name}=`))?.split('=')[1]
}

function listArg(name: string): string[] | undefined {
    const value = flagArg(name)
    return value
        ? value
              .split(',')
              .map(item => item.trim())
              .filter(Boolean)
        : undefined
}

function toStatus(value: string): Database['public']['Enums']['template_status'] {
    const known: readonly string[] = schema.template_status.enumValues
    if (!known.includes(value)) throw new Error(`Unknown template status "${value}". Expected one of ${known.join(', ')}.`)
    return value as Database['public']['Enums']['template_status']
}

async function mapWithConcurrency<T>(items: T[], limit: number, run: (item: T) => Promise<void>): Promise<void> {
    let next = 0

    await Promise.all(
        Array.from({ length: Math.min(limit, items.length) }, async () => {
            while (next < items.length) await run(items[next++])
        }),
    )
}
