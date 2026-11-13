#!/usr/bin/env node
// Opens the hub of this workspace in a real browser, signed in, and captures what a change looks like
// before anyone calls it done.
//
//   pnpm verify:ui /settings /templates                     every path, at every width, in both themes
//   pnpm verify:ui --scenario .context/verify/flow.mjs      a scripted walk: clicks, typing, a capture per step
//   pnpm verify:ui / --widths 375,1440 --themes dark --headed
//   pnpm verify:ui --engine --scenario …                     with a local engine behind the workspace
//   pnpm verify:ui --fresh /                                 a brand new account, to walk the signup
//   pnpm verify:ui --onboarded /                             an account past the onboarding
//   pnpm verify:ui --locale de /                             the app in a language pack (de, or en-XA)
//
// Local stack only (`pnpm db:start`): a hub on production provisions a real user and a real workspace
// on every page load, and the production profile carries the live Stripe keys. The script checks the
// stack and `apps/ui/.env` before the first request, and starts the hub on the local stack whatever
// `.env` says.
//
// It signs in as a throwaway account of its own, `verify-<workspace>@lumvika.local`, written straight
// into `auth.users` of the local Postgres, through the app's own email code: the code lands in Mailpit,
// the script reads it there and hands the session cookies to the browser.
//
// Its workspace is linked to an engine on CONDUCTOR_PORT + 1, through a pool row of the local stack:
// without one, a workspace that has no machine sits behind the waitlist wall. `--engine` also starts
// that engine (data in `.context/verify/engine-data`), for the changes that need it to answer.
//
// The account outlives the run, so what a scenario builds is still there the next time; `--fresh`
// deletes it first.
//
// A scenario is a module whose default export receives `{ page, step, base, db, userId, workspaceId }`:
// `await step('name')` captures the page at that point, `page` is a Playwright page already signed in
// on the hub, `db` a `pg` pool on the local Postgres (no row level security) to seed what the walk
// needs: `await db.query('update public.workspaces set name = $1 where id = $2', ['Acme', workspaceId])`.
//
// Everything lands in `.context/verify/<timestamp>/`: one PNG per path, width and theme, and a
// `report.json` with the load timings, the console errors and every failed request.

import { execFileSync, spawn } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { LOCAL_ENV, MAILPIT_URL, loadPg } from './db.mjs'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const UI_DIR = join(REPO_ROOT, 'apps/ui')
const PORT = Number(process.env.CONDUCTOR_PORT ?? 3050)
const ENGINE_PORT = PORT + 1
const WORKSPACE_NAME = (process.env.CONDUCTOR_WORKSPACE_NAME || basename(REPO_ROOT)).toLowerCase().replace(/[^a-z0-9-]/g, '-')
const VIEWPORTS = { 375: { width: 375, height: 812 }, 768: { width: 768, height: 1024 }, 1440: { width: 1440, height: 900 } }
const SHORT_VIEWPORT = { width: 1440, height: 700 }
const SERVER_READY_TIMEOUT_MS = 180_000
const SIGN_IN_CODE_TIMEOUT_MS = 20_000
const PROVISIONING_TIMEOUT_MS = 60_000
const MIGRATIONS_JOURNAL = join(REPO_ROOT, 'packages/db/migrations/meta/_journal.json')

const fromEngine = createRequire(join(REPO_ROOT, 'apps/engine/package.json'))
const { chromium } = fromEngine('patchright')

// What the script started stops with it, a failure included, unless `--keep` asks otherwise.
const started = []
let keepStarted = false
process.on('exit', () => {
    if (keepStarted) return
    for (const child of started) {
        try {
            process.kill(-child.pid)
        } catch {}
    }
})

function fail(message) {
    console.error(`\n[verify] ${message}\n`)
    process.exit(1)
}

function log(message) {
    console.log(`[verify] ${message}`)
}

function parseArgs(argv) {
    const options = { paths: [], widths: [375, 768, 1440], themes: ['light', 'dark'], short: true, headed: false, keep: false, engine: false, fresh: false, onboarded: false, scenario: null, locale: null }
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i]
        if (arg === '--widths') options.widths = argv[++i].split(',').map(Number)
        else if (arg === '--themes') options.themes = argv[++i].split(',')
        else if (arg === '--scenario') options.scenario = resolve(argv[++i])
        else if (arg === '--no-short') options.short = false
        else if (arg === '--headed') options.headed = true
        else if (arg === '--keep') options.keep = true
        else if (arg === '--engine') options.engine = true
        else if (arg === '--fresh') options.fresh = true
        else if (arg === '--onboarded') options.onboarded = true
        else if (arg === '--locale') options.locale = argv[++i]
        else if (arg.startsWith('/')) options.paths.push(arg)
        else fail(`Unknown argument: ${arg}`)
    }
    for (const width of options.widths) if (!VIEWPORTS[width]) fail(`Width ${width} is not one of ${Object.keys(VIEWPORTS).join(', ')}.`)
    if (options.paths.length === 0 && !options.scenario) options.paths.push('/')
    return options
}

async function localDatabase() {
    const pg = loadPg()
    const db = new pg.Pool({ connectionString: LOCAL_ENV.DATABASE_URL, max: 2, connectionTimeoutMillis: 3000 })
    try {
        await db.query('select 1')
    } catch {
        fail(`The local Postgres does not answer at ${LOCAL_ENV.DATABASE_URL}. Start the stack with \`pnpm db:start\`.`)
    }
    try {
        await fetch(`${MAILPIT_URL}/api/v1/info`)
    } catch {
        fail(`Mailpit does not answer at ${MAILPIT_URL}. Start the stack with \`pnpm db:start\`.`)
    }
    return db
}

// The Docker stack is shared by every worktree of the Mac and lags behind the branch: a column the
// code selects and the stack lacks fails the query and the page renders as broken.
async function assertMigrated(db) {
    const journal = JSON.parse(readFileSync(MIGRATIONS_JOURNAL, 'utf8')).entries
    const { rows } = await db.query(`select coalesce(max(created_at), 0)::text as last from drizzle.migrations`).catch(() => ({ rows: [{ last: '0' }] }))
    const pending = journal.filter(entry => entry.when > Number(rows[0].last)).map(entry => entry.tag)
    if (pending.length > 0) fail(`${pending.length} migrations are missing from the local stack (up to ${pending.at(-1)}). Run \`pnpm db:start\`.`)
}

const LOOPBACK = /^postgres(ql)?:\/\/[^@]*@(127\.0\.0\.1|localhost)[:/]/

function assertLocalProfile() {
    const dotenv = existsSync(join(UI_DIR, '.env')) ? readFileSync(join(UI_DIR, '.env'), 'utf8') : ''
    const profile = dotenv.match(/^# >>> lumvika env profile: (\S+)/m)?.[1]
    if (profile && profile !== 'local') fail(`apps/ui/.env is on the "${profile}" profile. Run \`pnpm cloud env:local\` first, never test against production.`)
    const databaseUrl = dotenv.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim()
    if (databaseUrl && !LOOPBACK.test(databaseUrl)) fail('apps/ui/.env points DATABASE_URL away from this machine. Point it at the local stack, never test against production.')
    if (/sk_live_/.test(dotenv)) fail('apps/ui/.env holds a live Stripe key. Use the local profile, never test against production.')
}

function listeningPid(port) {
    try {
        return execFileSync('lsof', ['-nP', '-t', `-iTCP:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' }).trim().split('\n')[0] || null
    } catch {
        return null
    }
}

function processCwd(pid) {
    const out = execFileSync('lsof', ['-a', '-p', pid, '-d', 'cwd', '-Fn'], { encoding: 'utf8' })
    return out.split('\n').find((line) => line.startsWith('n'))?.slice(1) ?? ''
}

// The process environment wins over `.env` in Next, and an empty value counts: the hub runs on the
// local stack, sends its email to Mailpit and reaches neither Stripe nor Bird, whatever `.env` or the
// shell exports.
const NEUTRALIZED_ENV = /STRIPE|^RESEND_API_KEY$|^BIRD_API_KEY$|^S3_PUBLIC_URL$|^S3_BUCKET_PREFIX$|^AUTH_COOKIE_DOMAIN$/

function localServerEnv(base) {
    const env = { ...process.env }
    for (const key of Object.keys(env)) if (key.startsWith('EXPO_PUBLIC')) delete env[key]
    const dotenv = existsSync(join(UI_DIR, '.env')) ? readFileSync(join(UI_DIR, '.env'), 'utf8') : ''
    const keys = new Set([...Object.keys(env), ...[...dotenv.matchAll(/^([A-Z0-9_]+)=/gm)].map((match) => match[1])])
    for (const key of keys) if (NEUTRALIZED_ENV.test(key)) env[key] = ''
    return { ...env, ...LOCAL_ENV, S3_REGION: 'auto', NEXT_PUBLIC_STORAGE_URL: LOCAL_ENV.S3_ENDPOINT, NEXT_PUBLIC_APP_URL: base, AUTH_TRUSTED_ORIGINS: base }
}

async function waitFor(url) {
    const deadline = Date.now() + SERVER_READY_TIMEOUT_MS
    while (Date.now() < deadline) {
        try {
            const response = await fetch(url)
            if (response.ok) return
        } catch {}
        await new Promise((done) => setTimeout(done, 1000))
    }
    fail(`${url} did not answer within ${SERVER_READY_TIMEOUT_MS / 1000}s.`)
}

function spawnLogged(command, args, options, logPath) {
    const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'], detached: true })
    const logFile = createWriteStream(logPath)
    child.stdout.pipe(logFile)
    child.stderr.pipe(logFile)
    child.on('exit', (code) => code && console.error(`[verify] ${command} ${args.join(' ')} exited with ${code}, see ${logPath}`))
    started.push(child)
    return child
}

async function ensureServer(base, outDir) {
    const pid = listeningPid(PORT)
    if (pid) {
        const cwd = processCwd(pid)
        if (!cwd.startsWith(REPO_ROOT)) fail(`Port ${PORT} is served from ${cwd}, another worktree. Stop it or set CONDUCTOR_PORT.`)
        const environ = execFileSync('ps', ['eww', '-o', 'command=', '-p', pid], { encoding: 'utf8' })
        const databaseUrl = environ.match(/\bDATABASE_URL=(\S+)/)?.[1]
        if (databaseUrl && !LOOPBACK.test(databaseUrl)) fail(`The server on port ${PORT} was started with a remote DATABASE_URL in its environment. Restart it.`)
        log(`Reusing the hub already running on port ${PORT}.`)
        return
    }
    // `lsof` does not see every listener (a sandbox, another user): a hub that answers is reused all the same.
    if (await fetch(`${base}/api/version`).then((response) => response.ok, () => false)) {
        log(`Reusing the hub answering on port ${PORT}.`)
        return
    }
    log(`Starting next dev on port ${PORT}.`)
    spawnLogged('pnpm', ['exec', 'next', 'dev', '-p', String(PORT)], { cwd: UI_DIR, env: localServerEnv(base) }, join(outDir, 'hub.log'))
    await waitFor(`${base}/api/version`)
}

async function linkTestEngine(db, userId) {
    const workspaceId = await provisionedWorkspace(db, userId)
    const apiKey = `verify-${WORKSPACE_NAME}-${workspaceId}`
    const host = `127.0.0.1:${ENGINE_PORT}`
    try {
        const { rowCount } = await db.query(`update public.engine_pool set engine_host = $1, engine_api_key = $2, status = 'claimed', provider = 'incus' where claimed_by_workspace_id = $3`, [host, apiKey, workspaceId])
        if (rowCount === 0) await db.query(`insert into public.engine_pool (engine_host, engine_api_key, status, claimed_by_workspace_id, provider) values ($1, $2, 'claimed', $3, 'incus')`, [host, apiKey, workspaceId])
    } catch (error) {
        fail(`Could not link an engine to workspace ${workspaceId}: ${error.message}`)
    }
    return { workspaceId, apiKey }
}

// The app gives a new account its `public.users` row and its workspace on the first page it serves.
async function provisionedWorkspace(db, userId) {
    const deadline = Date.now() + PROVISIONING_TIMEOUT_MS
    while (Date.now() < deadline) {
        const { rows } = await db.query('select workspace_id from public.users where id = $1', [userId])
        if (rows[0]?.workspace_id) return rows[0].workspace_id
        await new Promise((done) => setTimeout(done, 500))
    }
    fail(`The app did not provision a workspace for the test account within ${PROVISIONING_TIMEOUT_MS / 1000}s: see hub.log.`)
}

async function markOnboarded(db, workspaceId) {
    try {
        await db.query('update public.workspaces set onboarded_at = now() where id = $1 and onboarded_at is null', [workspaceId])
    } catch (error) {
        fail(`Could not mark workspace ${workspaceId} onboarded: ${error.message}`)
    }
}

async function startEngine(base, apiKey, outDir) {
    if (listeningPid(ENGINE_PORT)) fail(`Port ${ENGINE_PORT} is already taken, the local engine needs it.`)
    log(`Starting the engine on port ${ENGINE_PORT}.`)
    const env = { ...process.env, LUMVIKA_PORT: String(ENGINE_PORT), LUMVIKA_HOST: '127.0.0.1', LUMVIKA_API_KEY: apiKey, LUMVIKA_HUB_BASE_URL: base, LUMVIKA_DATA_DIR: join(REPO_ROOT, '.context/verify/engine-data') }
    spawnLogged('pnpm', ['--filter', 'lumvika-engine', 'dev'], { cwd: REPO_ROOT, env }, join(outDir, 'engine.log'))
    await waitFor(`http://127.0.0.1:${ENGINE_PORT}/health`)
}

async function testAccount(db, { fresh }) {
    const email = `verify-${WORKSPACE_NAME}@lumvika.local`
    if (fresh) await deleteTestAccount(db, email)
    try {
        await db.query(`insert into auth.users (name, email, email_verified) values ($1, $2, true) on conflict (email) do nothing`, [`Verify ${WORKSPACE_NAME}`, email])
    } catch (error) {
        fail(`Could not create ${email}: ${error.message}`)
    }
    const { rows } = await db.query('select id from auth.users where email = $1', [email])
    return { email, userId: rows[0].id }
}

// Deleting the `auth.users` row takes its sessions and its `public.users` row along.
async function deleteTestAccount(db, email) {
    const { rows } = await db.query('select u.id, p.workspace_id from auth.users u left join public.users p on p.id = u.id where u.email = $1', [email])
    if (rows.length === 0) return
    try {
        if (rows[0].workspace_id) await db.query('delete from public.engine_pool where claimed_by_workspace_id = $1', [rows[0].workspace_id])
        await db.query('delete from auth.users where id = $1', [rows[0].id])
    } catch (error) {
        fail(`Could not delete ${email} for --fresh: ${error.message}`)
    }
    log(`Deleted ${email} and its pool row.`)
}

async function mailpit(path, init) {
    const response = await fetch(`${MAILPIT_URL}/api/v1/${path}`, init)
    if (!response.ok) fail(`Mailpit answered ${response.status} to ${path}.`)
    return init?.method === 'DELETE' ? null : response.json()
}

async function readSignInCode(email) {
    const query = encodeURIComponent(`to:"${email}"`)
    const deadline = Date.now() + SIGN_IN_CODE_TIMEOUT_MS
    while (Date.now() < deadline) {
        const { messages } = await mailpit(`search?query=${query}&limit=1`)
        if (messages?.[0]) {
            const fromSubject = messages[0].Subject?.match(/\b\d{6}\b/)?.[0]
            if (fromSubject) return fromSubject
            const message = await mailpit(`message/${messages[0].ID}`)
            const fromText = message.Text?.match(/\b\d{6}\b/)?.[0]
            if (fromText) return fromText
        }
        await new Promise((done) => setTimeout(done, 500))
    }
    fail(`No sign-in code reached Mailpit for ${email} within ${SIGN_IN_CODE_TIMEOUT_MS / 1000}s. A hub started by hand may send through Resend (RESEND_API_KEY set) or have no SMTP_URL: stop it and let the script start it.`)
}

async function postAuth(base, path, body) {
    const response = await fetch(`${base}/api/auth/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify(body) })
    if (response.status === 403) fail(`POST /api/auth/${path} was refused for its origin ${base}: a hub started by hand trusts only NEXT_PUBLIC_APP_URL and AUTH_TRUSTED_ORIGINS. Stop it and let the script start it.`)
    if (!response.ok) fail(`POST /api/auth/${path} answered ${response.status}: ${(await response.text()).slice(0, 300)}`)
    return response
}

function toBrowserCookie(header) {
    const [pair, ...attributes] = header.split(';').map((part) => part.trim())
    const separator = pair.indexOf('=')
    const attribute = (name) => attributes.find((part) => part.toLowerCase().startsWith(name))
    const sameSite = attribute('samesite=')?.split('=')[1]?.toLowerCase()
    return {
        name: pair.slice(0, separator),
        value: pair.slice(separator + 1),
        domain: 'localhost',
        path: attribute('path=')?.split('=')[1] || '/',
        httpOnly: Boolean(attribute('httponly')),
        secure: Boolean(attribute('secure')),
        sameSite: sameSite === 'strict' ? 'Strict' : sameSite === 'none' ? 'None' : 'Lax',
    }
}

// The sign-in the app offers by email: a code sent through the app's own mailer, read back from
// Mailpit. Better Auth keeps its rate limits in the database: back-to-back runs start from zero.
async function signIn(context, base, db, account) {
    await db.query(`update auth.rate_limits set count = 0, last_request = 0 where key like '%/email-otp/%' or key like '%/sign-in/%'`)
    await db.query(`delete from public.email_sign_up_limits where scope = $1`, [`ip:mail:${account.email}`])
    await mailpit(`search?query=${encodeURIComponent(`to:"${account.email}"`)}`, { method: 'DELETE' })
    await postAuth(base, 'email-otp/send-verification-otp', { email: account.email, type: 'sign-in' })
    const otp = await readSignInCode(account.email)
    const response = await postAuth(base, 'sign-in/email-otp', { email: account.email, otp })
    const cookies = response.headers.getSetCookie().map(toBrowserCookie)
    if (cookies.length === 0) fail('The sign-in answered without a session cookie.')
    await context.addCookies(cookies)
    const page = await context.newPage()
    await page.goto(`${base}/`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
    await page.close()
}

function watch(page, report) {
    page.on('console', (message) => {
        if (message.type() === 'error' && !message.text().includes('/_next/hmr')) report.consoleErrors.push(message.text().slice(0, 500))
    })
    page.on('pageerror', (error) => report.pageErrors.push(String(error).slice(0, 500)))
    page.on('response', (response) => {
        if (response.status() >= 400) report.failedRequests.push(`${response.status()} ${response.request().method()} ${response.url()}`)
    })
    page.on('requestfailed', (request) => {
        const reason = request.failure()?.errorText ?? ''
        if (!reason.includes('ERR_ABORTED')) report.failedRequests.push(`FAILED ${request.method()} ${request.url()} ${reason}`)
    })
}

async function timings(page) {
    return page.evaluate(
        () =>
            new Promise((done) => {
                const nav = performance.getEntriesByType('navigation')[0]
                let lcp = null
                new PerformanceObserver((list) => {
                    const last = list.getEntries().at(-1)
                    if (last) lcp = last.startTime
                }).observe({ type: 'largest-contentful-paint', buffered: true })
                setTimeout(
                    () =>
                        done({
                            ttfbMs: nav ? Math.round(nav.responseStart) : null,
                            domContentLoadedMs: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
                            loadMs: nav ? Math.round(nav.loadEventEnd) : null,
                            lcpMs: lcp === null ? null : Math.round(lcp),
                            horizontalOverflowPx: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
                        }),
                    100,
                )
            }),
    )
}

const SETTLE_TIMEOUT_MS = 20_000

// Waits for the network to calm down and for every loading state (a "Loading…" label, a pulsing
// skeleton) to leave the screen. Answers false when one is still there at the deadline: a page stuck
// loading is a finding, not a capture to judge.
async function settle(page) {
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
    const settled = await page
        .waitForFunction(
            () => {
                const visible = (element) => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden'
                const skeleton = (element) => visible(element) && element.getBoundingClientRect().width > 24
                const pulsing = [...document.querySelectorAll('.animate-pulse, [data-slot="skeleton"]')].some(skeleton)
                const loadingLabel = [...document.querySelectorAll('body *')].some((element) => element.childElementCount === 0 && /^loading/i.test(element.textContent?.trim() ?? '') && visible(element))
                return !pulsing && !loadingLabel
            },
            null,
            { timeout: SETTLE_TIMEOUT_MS, polling: 250 },
        )
        .then(() => true)
        .catch(() => false)
    await page.waitForTimeout(500)
    return settled
}

function slug(text) {
    return text.replace(/^\//, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'home'
}

async function capturePaths(context, base, options, outDir) {
    const results = []
    const sizes = options.widths.map((width) => ({ name: String(width), viewport: VIEWPORTS[width] }))
    if (options.short) sizes.push({ name: '1440x700', viewport: SHORT_VIEWPORT })
    for (const path of options.paths) {
        for (const theme of options.themes) {
            for (const size of sizes) {
                const report = { path, theme, size: size.name, consoleErrors: [], pageErrors: [], failedRequests: [] }
                const page = await context.newPage()
                await page.addInitScript((value) => localStorage.setItem('theme', value), theme)
                await page.setViewportSize(size.viewport)
                watch(page, report)
                await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
                report.stillLoading = !(await settle(page))
                report.finalUrl = page.url().replace(base, '')
                report.timings = await timings(page)
                report.screenshot = join(outDir, `${slug(path)}.${theme}.${size.name}.png`)
                await page.screenshot({ path: report.screenshot, fullPage: false })
                await page.close()
                results.push(report)
                const flags = [report.stillLoading && 'STILL LOADING', report.timings.horizontalOverflowPx && `overflow ${report.timings.horizontalOverflowPx}px`, report.pageErrors.length && `${report.pageErrors.length} page errors`, report.consoleErrors.length && `${report.consoleErrors.length} console errors`].filter(Boolean)
                log(`${path} ${theme} ${size.name}: LCP ${report.timings.lcpMs ?? '?'} ms${flags.length ? ` · ${flags.join(' · ')}` : ''}`)
            }
        }
    }
    return results
}

async function runScenario(context, base, options, outDir, seed) {
    const report = { scenario: options.scenario, steps: [], consoleErrors: [], pageErrors: [], failedRequests: [] }
    const page = await context.newPage()
    await page.addInitScript((value) => localStorage.setItem('theme', value), options.themes[0])
    await page.setViewportSize(VIEWPORTS[options.widths.at(-1)])
    watch(page, report)
    let index = 0
    const step = async (name) => {
        const settled = await settle(page)
        const screenshot = join(outDir, `scenario.${String(++index).padStart(2, '0')}.${slug(name)}.png`)
        await page.screenshot({ path: screenshot })
        report.steps.push({ name, url: page.url().replace(base, ''), screenshot, stillLoading: !settled, at: new Date().toISOString() })
        log(`step ${index}: ${name}${settled ? '' : ' · STILL LOADING'}`)
    }
    const { default: scenario } = await import(pathToFileURL(options.scenario).href)
    try {
        await scenario({ page, step, base, ...seed })
    } catch (error) {
        report.error = String(error?.stack ?? error)
        await step('failure').catch(() => {})
        log(`Scenario failed: ${error?.message ?? error}`)
    }
    await page.close()
    return report
}

const options = parseArgs(process.argv.slice(2))
keepStarted = options.keep
assertLocalProfile()
const db = await localDatabase()
await assertMigrated(db)

const base = `http://localhost:${PORT}`
const outDir = join(REPO_ROOT, '.context/verify', new Date().toISOString().replace(/[:.]/g, '-'))
mkdirSync(outDir, { recursive: true })
// The hub and engine logs grow on every request: written inside the repository, they wake the dev
// server's file watcher, which recompiles mid sign-in and sends the sign-in page round again.
const logDir = mkdtempSync(join(tmpdir(), 'lumvika-verify-'))
await ensureServer(base, logDir)

// Chromium's Local Network Access checks hold every request the page makes to the loopback stack
// (the S3 store on 127.0.0.1:54437) and the dev server's HMR socket behind a permission prompt nobody answers.
const browser = await chromium.launch({ headless: !options.headed, args: ['--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests'] })
// A language pack is picked by the cookie the Account dialog writes, and the browser asks for it too.
// The test accounts (`@lumvika.local`) are in the early access of the language packs.
const context = await browser.newContext(options.locale ? { locale: options.locale } : {})
await context.addCookies([
    { name: 'lumvika-consent', value: `v1:denied:${Date.now()}`, url: base },
    ...(options.locale ? [{ name: 'NEXT_LOCALE', value: options.locale, url: base }] : []),
])
let failed = false
try {
    const account = await testAccount(db, options)
    await signIn(context, base, db, account)
    const engineLink = await linkTestEngine(db, account.userId)
    if (options.onboarded) await markOnboarded(db, engineLink.workspaceId)
    if (options.engine) await startEngine(base, engineLink.apiKey, logDir)
    log(`Signed in as ${account.email}, workspace ${engineLink.workspaceId}.`)

    const pages = options.paths.length > 0 ? await capturePaths(context, base, options, outDir) : []
    const scenario = options.scenario ? await runScenario(context, base, options, outDir, { db, userId: account.userId, workspaceId: engineLink.workspaceId }) : null
    writeFileSync(join(outDir, 'report.json'), JSON.stringify({ base, account: account.email, pages, scenario }, null, 2))
    failed = Boolean(scenario?.error) || pages.some((page) => page.pageErrors.length > 0)
    log(`Report: ${join(outDir, 'report.json')}, logs in ${logDir}`)
} finally {
    await browser.close()
    await db.end()
}
process.exit(failed ? 1 : 0)
