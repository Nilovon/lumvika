#!/usr/bin/env node
// Installs the private `cloud/` workspace after the root install, when it is in the checkout. Its
// packages link to the dependencies of apps/ui, so it has to come second. A checkout without it (an
// open source clone) has nothing to do, and neither has an install that left the app out (a Docker
// stage or a CI job filtered to one package): the Dockerfiles install cloud/ on their own.
//
// It also puts in place the links cloud/links.txt lists (the team's skills, CLAUDE.local.md), and keeps
// them out of git through .git/info/exclude.

import { execFileSync, spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, rmSync, symlinkSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CLOUD_DIR = join(REPO_ROOT, 'cloud')
const LINKS_FILE = join(CLOUD_DIR, 'links.txt')
const APP_INSTALLED = existsSync(join(REPO_ROOT, 'apps/ui/node_modules'))

function gitExcludeFile() {
    try {
        const commonDir = execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim()
        return join(isAbsolute(commonDir) ? commonDir : join(REPO_ROOT, commonDir), 'info', 'exclude')
    } catch {
        return null
    }
}

function linkCloudFiles() {
    if (!existsSync(LINKS_FILE)) return
    const entries = readFileSync(LINKS_FILE, 'utf8')
        .split('\n')
        .filter((line) => line.trim() && !line.startsWith('#'))
        .map((line) => line.split('\t'))
    const excludeFile = gitExcludeFile()
    const excluded = excludeFile && existsSync(excludeFile) ? new Set(readFileSync(excludeFile, 'utf8').split('\n')) : new Set()

    for (const [link, target] of entries) {
        const path = join(REPO_ROOT, link)
        const current = lstatSync(path, { throwIfNoEntry: false })
        if (current?.isSymbolicLink() && readlinkSync(path) === target) {
            // already in place
        } else {
            if (current?.isSymbolicLink()) rmSync(path)
            else if (current) {
                console.warn(`cloud links: ${link} exists and is not a link, left alone`)
                continue
            }
            mkdirSync(dirname(path), { recursive: true })
            symlinkSync(target, path)
        }
        if (excludeFile && !excluded.has(`/${link}`)) {
            mkdirSync(dirname(excludeFile), { recursive: true })
            appendFileSync(excludeFile, `/${link}\n`)
            excluded.add(`/${link}`)
        }
    }
}

linkCloudFiles()

if (APP_INSTALLED && existsSync(join(CLOUD_DIR, 'pnpm-workspace.yaml'))) {
    const result = spawnSync('pnpm', ['install', '--frozen-lockfile'], { cwd: CLOUD_DIR, stdio: 'inherit' })
    process.exit(result.status ?? 1)
}
