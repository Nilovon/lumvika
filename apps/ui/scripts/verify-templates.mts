// End-to-end check of the templates write path against the real database.
// Creates a throwaway draft, exercises the validation gates and the anon grant, then
// deletes it. Run: ../engine/node_modules/.bin/tsx --env-file=.env scripts/verify-templates.mts

import { templateDocumentSchema, type TemplateAgent, type TemplateDocument } from '@lumvika/contracts'
import { AGENT_ARCHIVE_BUCKET, archivePath, type TemplateAgentArchive } from '../lib/templates/archives'
import { removeCapturedAgent } from '../lib/templates/capture'
import { rowToDocument, TEMPLATE_DOC_COLUMNS, type TemplateRow } from '../lib/templates/document'
import { uploadPrivateFile } from '../lib/storage/private'
import { createTemplate, updateTemplateBySlug } from '../lib/templates/write'
import { listObjects } from '@lumvika/storage'
// Straight from the package rather than through `@/lib/db`: that barrel is a star re-export inside
// this CommonJS app, whose named exports an .mts file run by tsx cannot read.
import { anonScope, deleteRows, selectMany, selectMaybeSingle, serviceScope, updateRows, type DbScope } from '@lumvika/db'

const SLUG = 'zz-verify-scratch-template'

let passed = 0
let failed = 0

function check(label: string, ok: boolean, detail?: string) {
    if (ok) {
        passed++
        console.log(`  ok    ${label}`)
    } else {
        failed++
        console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`)
    }
}

// The app only ever gets an agent from a capture, so the fixture is built here rather than
// exported from the write path.
function agent(key: string): TemplateAgent {
    return { key, name: 'New agent', role: '', description: '', connectorSlugs: [], setupRequired: false, skills: [], schedules: [], triggers: [], tools: [] }
}

async function readConnectors(scope: DbScope): Promise<{ slug: string; name: string }[]> {
    const { data } = await selectMaybeSingle(scope, 'templates', ['connectors'] as const, { slug: SLUG })
    return (data?.connectors ?? []) as { slug: string; name: string }[]
}

function doc(overrides: Partial<TemplateDocument> = {}): TemplateDocument {
    return templateDocumentSchema.parse({
        slug: SLUG,
        title: 'Verify scratch',
        tagline: 'Throwaway row.',
        agents: [agent('agent_1')],
        ...overrides,
    })
}

async function main() {
    const scope = serviceScope()
    await deleteRows(scope, 'templates', { slug: SLUG })

    // Denormalisation is checked against a real catalog entry rather than a fixture: the whole
    // point is that the write path resolves name and icon off `services`.
    const { data: services } = await selectMany(scope, 'services', ['slug', 'name'] as const, { enabled: true }, { column: 'slug' }, 1)
    const service = services?.[0]
    if (!service) throw new Error('No enabled service in the catalog to test connectors against')

    console.log('\nwrite path')
    const created = await createTemplate(scope, doc())
    check('creates a draft', created.ok, created.ok ? undefined : created.error)

    const twoAgents = await updateTemplateBySlug(scope, SLUG, doc({ agents: [agent('agent_1'), agent('agent_2')] }))
    check('saves two agents', twoAgents.ok, twoAgents.ok ? undefined : twoAgents.error)

    const { data: counted } = await selectMaybeSingle(scope, 'templates', ['agent_count'] as const, { slug: SLUG })
    check('agent_count is generated from agents', counted?.agent_count === 2, `agent_count=${counted?.agent_count}`)

    // The connector list is derived from the agents, never authored, so every assertion here
    // goes through an agent carrying the slug.
    console.log('\nconnectors')
    const withConnector = await updateTemplateBySlug(scope, SLUG, doc({ agents: [{ ...agent('agent_1'), connectorSlugs: [service.slug] }] }))
    check('saves an agent carrying a catalog connector', withConnector.ok, withConnector.ok ? undefined : withConnector.error)

    const storedConnectors = await readConnectors(scope)
    check(
        'derives the connector list from the agents, with the name resolved off the catalog',
        storedConnectors.length === 1 && storedConnectors[0]?.slug === service.slug && storedConnectors[0]?.name === service.name,
        JSON.stringify(storedConnectors),
    )

    const offCatalog = await updateTemplateBySlug(scope, SLUG, doc({ agents: [{ ...agent('agent_1'), connectorSlugs: ['zz-not-a-service'] }] }))
    check(
        'warns but still saves a connector that is not in the catalog',
        offCatalog.ok && offCatalog.warnings.length > 0,
        offCatalog.ok ? 'it saved without a warning' : offCatalog.error,
    )
    check('falls back to the slug as a name for it', (await readConnectors(scope))[0]?.name === 'zz-not-a-service')

    await updateTemplateBySlug(scope, SLUG, doc())
    check('drops a connector no agent uses any more', (await readConnectors(scope)).length === 0)

    console.log('\npublish gate')
    const noImage = await updateTemplateBySlug(scope, SLUG, doc({ status: 'published' }))
    check('refuses to publish without an image', !noImage.ok, noImage.ok ? 'it published' : noImage.error)

    const noTagline = await updateTemplateBySlug(scope, SLUG, doc({ status: 'published', tagline: '', gallery: [{ url: 'https://x/y.webp', alt: 'a' }] }))
    check('refuses to publish without a tagline', !noTagline.ok, noTagline.ok ? 'it published' : noTagline.error)

    const ok = await updateTemplateBySlug(scope, SLUG, doc({ status: 'published', gallery: [{ url: 'https://x/y.webp', alt: 'a' }] }))
    check('publishes when complete', ok.ok, ok.ok ? undefined : ok.error)

    const { data: stillReadable } = await selectMaybeSingle(scope, 'templates', TEMPLATE_DOC_COLUMNS, { slug: SLUG })
    let roundTrips = false
    try {
        rowToDocument(stillReadable as unknown as TemplateRow)
        roundTrips = true
    } catch (err) {
        console.log(`        ${err instanceof Error ? err.message : String(err)}`)
    }
    check('the stored row round-trips through rowToDocument', roundTrips)

    console.log('\nsecret safety')
    const complete = { status: 'published' as const, gallery: [{ url: 'https://x/y.webp', alt: 'a' }] }
    const leaking = { longDescription: 'my key is sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' }

    const draftWithSecret = await updateTemplateBySlug(scope, SLUG, doc(leaking))
    check(
        'warns but still saves a draft holding a pasted API key',
        draftWithSecret.ok && draftWithSecret.warnings.length > 0,
        draftWithSecret.ok ? 'it saved without a warning' : draftWithSecret.error,
    )

    const publishWithSecret = await updateTemplateBySlug(scope, SLUG, doc({ ...complete, ...leaking }))
    check('refuses to publish it', !publishWithSecret.ok, publishWithSecret.ok ? 'it published' : publishWithSecret.error)

    const leakingSkill = {
        agents: [{ ...agent('agent_1'), skills: [{ name: 'Deploy', description: 'use Bearer AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' }] }],
    }
    const publishWithSecretSkill = await updateTemplateBySlug(scope, SLUG, doc({ ...complete, ...leakingSkill }))
    check('refuses to publish a token pasted into a skill description', !publishWithSecretSkill.ok, publishWithSecretSkill.ok ? 'it published' : publishWithSecretSkill.error)

    // The anon checks below read a published row, and the two writes above left a draft.
    const republished = await updateTemplateBySlug(scope, SLUG, doc(complete))
    check('publishes again once the key is gone', republished.ok, republished.ok ? undefined : republished.error)

    // A column added after the column-level grant inherits nothing, so this is the guard against
    // a migration that half-lands and leaves the public page with no agents.
    console.log('\nanon grant')
    const anon = anonScope()
    const publicRead = await selectMany(anon, 'templates', ['slug', 'title', 'agents', 'connectors', 'agent_count'] as const, { slug: SLUG })
    check('anon can read the editorial columns', publicRead.error === null && publicRead.data?.length === 1, publicRead.error?.message)

    // `status` is the master gate, the two flags pick the surfaces — and the RLS policies,
    // not the callers, are what keep a library-only template out of the public marketplace.
    console.log('\nsurface visibility')
    const libraryOnly = await updateTemplateBySlug(scope, SLUG, doc({ ...complete, showInMarketplace: false }))
    check('saves a library-only template', libraryOnly.ok, libraryOnly.ok ? undefined : libraryOnly.error)

    const hiddenFromAnon = await selectMany(anon, 'templates', ['slug'] as const, { slug: SLUG })
    check('anon cannot read a library-only template', (hiddenFromAnon.data ?? []).length === 0, `returned ${JSON.stringify(hiddenFromAnon.data)}`)

    await updateTemplateBySlug(scope, SLUG, doc({ ...complete, showInMarketplace: false, showInLibrary: false }))
    const hiddenEverywhere = await selectMany(anon, 'templates', ['slug'] as const, { slug: SLUG })
    check('anon cannot read a template with no surface', (hiddenEverywhere.data ?? []).length === 0, `returned ${JSON.stringify(hiddenEverywhere.data)}`)

    await updateTemplateBySlug(scope, SLUG, doc(complete))
    const backOnMarketplace = await selectMany(anon, 'templates', ['slug'] as const, { slug: SLUG })
    check('anon reads it again once the marketplace flag is back on', (backOnMarketplace.data ?? []).length === 1, backOnMarketplace.error?.message)

    // Unlisted is the one status whose page survives the marketplace flag being off: the row stays
    // readable by slug, while every listing filters it out.
    console.log('\nunlisted')
    const incompleteUnlisted = await updateTemplateBySlug(scope, SLUG, doc({ status: 'unlisted', tagline: '' }))
    check('holds an unlisted template to the publish gate', !incompleteUnlisted.ok, incompleteUnlisted.ok ? 'it saved' : incompleteUnlisted.error)

    const unlisted = await updateTemplateBySlug(scope, SLUG, doc({ ...complete, status: 'unlisted', showInMarketplace: false }))
    check('saves an unlisted template with the marketplace flag off', unlisted.ok, unlisted.ok ? undefined : unlisted.error)

    const { data: stamped } = await selectMaybeSingle(scope, 'templates', ['published_at'] as const, { slug: SLUG })
    check('stamps published_at like a published one', stamped?.published_at !== null, `published_at=${stamped?.published_at}`)

    const unlistedByLink = await selectMany(anon, 'templates', ['slug'] as const, { slug: SLUG })
    check('anon reads it by slug', (unlistedByLink.data ?? []).length === 1, unlistedByLink.error?.message)

    const unlistedInListing = await selectMany(anon, 'templates', ['slug'] as const, { slug: SLUG, status: 'published', show_in_marketplace: true })
    check('the listing filter leaves it out', (unlistedInListing.data ?? []).length === 0, `returned ${JSON.stringify(unlistedInListing.data)}`)

    await updateTemplateBySlug(scope, SLUG, doc(complete))

    // Removing an agent is the only path that deletes an archive, and an orphaned .tar.gz in a
    // private bucket is invisible from the admin, so it is checked against real storage.
    console.log('\ncaptured agents')
    await updateTemplateBySlug(scope, SLUG, doc({ ...complete, agents: [{ ...agent('agent_1'), connectorSlugs: [service.slug] }] }))
    const path = archivePath(SLUG, 'agent_1')
    await uploadPrivateFile(scope, AGENT_ARCHIVE_BUCKET, path, new Uint8Array([31, 139, 8]), 'application/gzip')
    const archive: TemplateAgentArchive = {
        agentKey: 'agent_1',
        engineAgentId: 'zz-verify-engine-agent',
        path,
        bytes: 3,
        engineCommit: null,
        capturedAt: new Date().toISOString(),
        strippedConfigKeys: [],
        excludedPaths: [],
        envKeys: [],
        mcpAuth: [],
        redactions: [],
    }
    await updateRows(scope, 'templates', { agent_archives: [archive] }, { slug: SLUG })

    await removeCapturedAgent(scope, SLUG, 'agent_1')
    const { data: afterRemoval } = await selectMaybeSingle(scope, 'templates', ['agents', 'connectors', 'agent_archives'] as const, { slug: SLUG })
    check('removing an agent drops its editorial entry', (afterRemoval?.agents as unknown[])?.length === 0, JSON.stringify(afterRemoval?.agents))
    check('removing an agent drops its archive entry', (afterRemoval?.agent_archives as unknown[])?.length === 0, JSON.stringify(afterRemoval?.agent_archives))
    check('removing an agent drops the connectors it was the last user of', (afterRemoval?.connectors as unknown[])?.length === 0, JSON.stringify(afterRemoval?.connectors))

    const { data: leftInBucket } = await listObjects(AGENT_ARCHIVE_BUCKET, `${SLUG}/agent_1`)
    check('removing an agent deletes the archive object', (leftInBucket ?? []).length === 0, JSON.stringify(leftInBucket?.map(f => f.name)))

    await deleteRows(scope, 'templates', { slug: SLUG })
    const { data: gone } = await selectMaybeSingle(scope, 'templates', ['id'] as const, { slug: SLUG })
    check('cleans up', gone === null)

    console.log(`\n${passed} passed, ${failed} failed\n`)
    process.exit(failed === 0 ? 0 : 1)
}

main().catch(err => {
    console.error(err)
    process.exit(1)
})
