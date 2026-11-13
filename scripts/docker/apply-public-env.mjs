#!/usr/bin/env node
// Next.js inlines every NEXT_PUBLIC_* value into the bundles at build time. The published app image is
// built once for every install, with the placeholders below in place of the values that differ from
// one install to the next; this script, run by the image's entrypoint before the app starts, writes
// the values of this install over them.
//
// Only values whose code never tests them for truthiness can be swapped this way: the minifier folds
// `if (process.env.X)` away at build time. The captcha and PostHog keys stay build arguments.

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

export const PLACEHOLDERS = {
    NEXT_PUBLIC_APP_URL: 'https://app-url.runtime.lumvika.invalid',
    NEXT_PUBLIC_STORAGE_URL: 'https://storage-url.runtime.lumvika.invalid',
    NEXT_PUBLIC_ADMIN_EMAILS: 'admin-emails@runtime.lumvika.invalid',
    NEXT_PUBLIC_OAUTH_PROVIDERS: 'oauth-providers.runtime.lumvika.invalid',
}

const NEXT_DIR = process.argv[2] ?? '/app/apps/ui/.next'
const APPLIED_MARKER = join(NEXT_DIR, 'public-env.json')
const UNSAFE_CHARACTERS = /["'`\\<>\s]/

function withoutTrailingSlash(url) {
    return url.replace(/\/+$/, '')
}

function runtimeValues(env) {
    return {
        NEXT_PUBLIC_APP_URL: withoutTrailingSlash(env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'),
        NEXT_PUBLIC_STORAGE_URL: withoutTrailingSlash(env.NEXT_PUBLIC_STORAGE_URL || 'http://localhost:3002'),
        NEXT_PUBLIC_ADMIN_EMAILS: (env.NEXT_PUBLIC_ADMIN_EMAILS || env.ADMIN_EMAILS || '').replace(/\s+/g, ''),
        NEXT_PUBLIC_OAUTH_PROVIDERS: (env.NEXT_PUBLIC_OAUTH_PROVIDERS || '').replace(/\s+/g, ''),
    }
}

function* filesUnder(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (entry.name === 'cache') continue
        const path = join(directory, entry.name)
        if (entry.isDirectory()) yield* filesUnder(path)
        else if (entry.isFile()) yield path
    }
}

function apply() {
    if (!existsSync(NEXT_DIR)) return
    const values = runtimeValues(process.env)
    for (const [key, value] of Object.entries(values)) {
        if (UNSAFE_CHARACTERS.test(value)) throw new Error(`${key} holds a quote, a backslash, a bracket or a space: ${JSON.stringify(value)}`)
        if ((key === 'NEXT_PUBLIC_APP_URL' || key === 'NEXT_PUBLIC_STORAGE_URL') && !/^https?:\/\//.test(value)) throw new Error(`${key} must start with http:// or https://, got ${JSON.stringify(value)}`)
    }

    if (existsSync(APPLIED_MARKER)) {
        const applied = JSON.parse(readFileSync(APPLIED_MARKER, 'utf8'))
        const changed = Object.keys(values).filter(key => applied[key] !== values[key])
        if (changed.length) console.warn(`! ${changed.join(', ')} changed since this container started. Recreate it to apply: docker compose up -d --force-recreate app`)
        return
    }

    const pairs = Object.entries(PLACEHOLDERS).map(([key, placeholder]) => [placeholder, values[key]])
    let rewritten = 0
    for (const path of filesUnder(NEXT_DIR)) {
        const original = readFileSync(path, 'latin1')
        if (!pairs.some(([placeholder]) => original.includes(placeholder))) continue
        let text = readFileSync(path, 'utf8')
        for (const [placeholder, value] of pairs) text = text.replaceAll(placeholder, value)
        writeFileSync(path, text)
        rewritten++
    }
    writeFileSync(APPLIED_MARKER, JSON.stringify(values))
    if (rewritten) console.log(`App configured for ${values.NEXT_PUBLIC_APP_URL} (${rewritten} files).`)
}

try {
    apply()
} catch (error) {
    console.error(`\n${error.message ?? error}\n`)
    process.exit(1)
}
