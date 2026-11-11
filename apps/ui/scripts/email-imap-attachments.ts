import type { Json } from '@/app/api/database.types'
import { serviceManifestSchema } from '../lib/services/manifest'
import { closeDb, selectSingle, serviceScope, updateRows } from '../lib/db'

// One-shot: opens attachment files to the email-imap-smtp service, rooted in the coworker workspace.
// Needs an engine that resolves ${LUMVIKA_WORKSPACE} in a server config: on an older one the root is "".
//
//   ../engine/node_modules/.bin/tsx --env-file=.env scripts/email-imap-attachments.ts [--write]
//
// Add `--env-file=.env.profile.staging` after `.env` to target the staging project.

const SLUG = 'email-imap-smtp'
const OLD_SENTENCE = 'Saving attachments to disk is not available.'
const NEW_SENTENCE =
    'To get the file of an attachment, call save_attachment with savePath set to the absolute path of the mail-attachments folder inside your workspace, then read or upload the saved file with shell_exec. Never set returnBase64.'

const DATABASE_HOST = new URL(process.env.DATABASE_URL ?? 'postgres://unset').host
type RawManifest = { mcpServers: { name: string; env: Record<string, string> }[]; skills: { body: string }[] }

async function main() {
    const write = process.argv.includes('--write')
    const scope = serviceScope()
    const { data, error } = await selectSingle(scope, 'services', ['manifest'] as const, { slug: SLUG })
    if (error || !data) throw error ?? new Error(`${SLUG} not found`)

    serviceManifestSchema.parse(data.manifest)
    const raw = structuredClone(data.manifest) as unknown as RawManifest
    const server = raw.mcpServers.find(s => s.name === 'email')
    if (!server) throw new Error('no "email" server in the manifest')
    server.env.MAIL_ALLOWED_ROOTS = '${LUMVIKA_WORKSPACE}'
    const skill = raw.skills.find(s => s.body.includes(OLD_SENTENCE) || s.body.includes(NEW_SENTENCE))
    if (!skill) throw new Error('usage skill sentence not found')
    skill.body = skill.body.replace(OLD_SENTENCE, NEW_SENTENCE)
    serviceManifestSchema.parse(raw)

    console.log(JSON.stringify({ env: server.env.MAIL_ALLOWED_ROOTS, skill: skill.body }, null, 2))
    if (!write) return console.log(`dry run on ${DATABASE_HOST}, pass --write`)

    const { error: updateError } = await updateRows(scope, 'services', { manifest: raw as unknown as Json }, { slug: SLUG })
    if (updateError) throw updateError
    console.log(`written on ${DATABASE_HOST}`)
}

main()
    .then(closeDb)
    .catch(e => {
        console.error(e)
        process.exit(1)
    })
