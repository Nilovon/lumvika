#!/usr/bin/env node
// The Expo iOS app in the simulator or on the paired iPhone, from a bare checkout to a running bundle.
//
//   pnpm dev:mobile                     this workspace's own simulator, reusing a dev client already built for the same native inputs
//   pnpm dev:mobile --device            the paired iPhone, signed with the Apple ID added in Xcode (a free one is enough)
//   pnpm dev:mobile [--device] --rebuild   ignore the cached dev client and force the native build
//
// The app talks to the Next server of this workspace (apps/ui, on CONDUCTOR_PORT), so the script
// starts it too, unless the `ui` run script already serves that port or EXPO_PUBLIC_API_URL points
// the app at a deployed hub.
//
// The native project is built with xcodebuild rather than `expo run:ios`: the latter targets the
// paired iPhone first and dies on code signing. `ios/` is generated and gitignored, so a fresh
// workspace goes through `expo prebuild` first. The built Lumvika.app only depends on the native inputs,
// the JS comes from Metro, so every successful build is kept in a cache shared by all the workspaces of
// this Mac, keyed by those inputs. A workspace whose key was already built skips prebuild and build.
// The key leaves pnpm-lock.yaml out, it changes with every PR: a native module bumped through the
// lockfile alone needs --rebuild.
// Every dev build uses the personal team config (see app.config.ts): no Sign in with Apple
// capability and a `.dev` bundle ID, so the same `ios/` serves the simulator and a free-signed iPhone.
// Metro gets CONDUCTOR_PORT + 2 and each workspace gets its own simulator, "Lumvika · <workspace>",
// so two workspaces can run the app at once. Metro's `i` key opens the first booted simulator of the
// Mac, whichever workspace it belongs to: reload with `r` or ⌘R instead.

import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const APP_DIR = join(REPO_ROOT, 'apps/mobile')
const IOS_DIR = join(APP_DIR, 'ios')
// Outside ios/: prebuild recreates that directory from scratch and would take the build cache with it.
const DERIVED_DATA_DIR = join(APP_DIR, '.expo/xcode-build')
const PREBUILD_STAMP = join(DERIVED_DATA_DIR, '.lumvika-prebuild-stamp')
const TEAM_STAMP = join(DERIVED_DATA_DIR, '.lumvika-apple-team')
const NATIVE_INPUTS = ['package.json', 'app.json', 'app.config.ts']
// Outside every worktree, so archiving a workspace does not take the dev clients with it.
const CLIENT_CACHE_DIR = join(homedir(), 'Library/Caches/lumvika-mobile')
const INSTALLED_DIR = join(CLIENT_CACHE_DIR, 'installed')
const CLIENT_KEY = /^[0-9a-f]{64}$/
const KEPT_CLIENTS = 4
const STALE_COPY_MS = 60 * 60_000
const SIMULATOR_PREFIX = 'Lumvika · '
const SIMULATOR_TYPE = 'com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro'
const WORKSPACE_NAME = process.env.CONDUCTOR_WORKSPACE_NAME || basename(REPO_ROOT)
const API_PORT = Number(process.env.CONDUCTOR_PORT ?? 3050)
const METRO_PORT = API_PORT + 2
const onDevice = process.argv.includes('--device')
const forceRebuild = process.argv.includes('--rebuild')

function dotenvValue(key) {
    const dotenv = existsSync(join(APP_DIR, '.env')) ? readFileSync(join(APP_DIR, '.env'), 'utf8') : ''
    return dotenv.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]?.trim() ?? ''
}

const remoteApiUrl = process.env.EXPO_PUBLIC_API_URL || dotenvValue('EXPO_PUBLIC_API_URL')
const usesLocalApi = !remoteApiUrl

// The simulator shares the Mac's loopback; the iPhone reaches the Mac over Wi-Fi, and ATS lets a raw
// IP through in clear. An explicit EXPO_PUBLIC_API_URL (say, staging) wins over both.
function apiUrl() {
    if (!usesLocalApi) return remoteApiUrl
    if (!onDevice) return `http://localhost:${API_PORT}`
    const lanIp = spawnSync('ipconfig', ['getifaddr', 'en0'], { encoding: 'utf8' }).stdout?.trim()
    return `http://${lanIp || 'localhost'}:${API_PORT}`
}

// CocoaPods from Homebrew: the system 1.11 is too old for React Native 0.86. Without
// EXPO_NO_GIT_STATUS, prebuild stops on a prompt as soon as the worktree is dirty.
const env = { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH}`, EXPO_NO_GIT_STATUS: '1', LUMVIKA_PERSONAL_TEAM: '1', EXPO_PUBLIC_API_URL: apiUrl() }

function log(message) {
    console.log(`[mobile] ${message}`)
}

function fail(message) {
    log(message)
    process.exit(1)
}

function runOrExit(command, args, options = {}) {
    const result = spawnSync(command, args, { stdio: 'inherit', env, cwd: APP_DIR, ...options })
    if (result.status !== 0) {
        log(`\`${command} ${args.join(' ')}\` failed`)
        process.exit(result.status ?? 1)
    }
}

// `-quiet` still lets through every clang and swift warning of the ~130 pods, tens of thousands of
// lines that bury both the progress and a real failure. Errors are untouched.
const QUIET_WARNINGS = ['GCC_WARN_INHIBIT_ALL_WARNINGS=YES', 'SWIFT_SUPPRESS_WARNINGS=YES']

// Xcode 26 keeps every compiled object in a CAS under the derived data of this workspace, which
// survives a wiped ios/ (not a new workspace), so a rebuild only pays for what actually changed.
// Off unless asked for.
const BUILD_CACHE = ['COMPILATION_CACHE_ENABLE_CACHING=YES']

// A quiet xcodebuild prints nothing for the ten-odd minutes of a cold build, so it gets a heartbeat.
function runBuild(args) {
    return new Promise(done => {
        const startedAt = Date.now()
        const minutes = () => Math.round((Date.now() - startedAt) / 60_000)
        const heartbeat = setInterval(() => log(`still compiling, ${minutes()} min in`), 60_000)
        const build = spawn('xcodebuild', args, { stdio: 'inherit', env, cwd: APP_DIR })
        build.on('exit', code => {
            clearInterval(heartbeat)
            if (code !== 0) fail('`xcodebuild` failed, the error is above')
            log(`built in ${minutes()} min`)
            done()
        })
    })
}

function capture(command, args) {
    return spawnSync(command, args, { encoding: 'utf8', env }).stdout ?? ''
}

function devicectlJson(args) {
    const output = join(tmpdir(), `lumvika-devicectl-${process.pid}.json`)
    spawnSync('xcrun', ['devicectl', ...args, '--quiet', '--json-output', output], { stdio: 'ignore', env })
    if (!existsSync(output)) return null
    const json = JSON.parse(readFileSync(output, 'utf8'))
    rmSync(output)
    return json.result
}

function readBundleId() {
    const config = JSON.parse(capture('pnpm', ['--dir', APP_DIR, 'exec', 'expo', 'config', '--type', 'public', '--json']))
    return config.ios.bundleIdentifier
}

function availableSimulators() {
    const { devices } = JSON.parse(capture('xcrun', ['simctl', 'list', 'devices', 'available', '--json']))
    return Object.values(devices).flat()
}

function latestIosRuntime() {
    const { runtimes } = JSON.parse(capture('xcrun', ['simctl', 'list', 'runtimes', '--json']))
    const iosRuntimes = runtimes
        .filter(runtime => runtime.platform === 'iOS' && runtime.isAvailable)
        .sort((a, b) => a.version.localeCompare(b.version, undefined, { numeric: true }))
    if (!iosRuntimes.length) fail('no iOS simulator runtime installed, add one with `xcodebuild -downloadPlatform iOS`')
    return iosRuntimes.at(-1).identifier
}

// A booted simulator stays up after Ctrl-C so the next run starts at once, which is why the ones of
// archived workspaces get deleted here: they would keep their RAM forever.
function deleteArchivedWorkspaceSimulators() {
    const workspacePath = process.env.CONDUCTOR_WORKSPACE_PATH
    if (!workspacePath) return
    for (const simulator of availableSimulators()) {
        if (!simulator.name.startsWith(SIMULATOR_PREFIX)) continue
        const workspace = simulator.name.slice(SIMULATOR_PREFIX.length)
        if (existsSync(join(dirname(workspacePath), workspace))) continue
        log(`deleting the simulator of the archived workspace ${workspace}`)
        spawnSync('xcrun', ['simctl', 'shutdown', simulator.udid], { stdio: 'ignore' })
        spawnSync('xcrun', ['simctl', 'delete', simulator.udid], { stdio: 'ignore' })
        rmSync(join(INSTALLED_DIR, simulator.udid), { force: true })
    }
}

function workspaceSimulator() {
    const name = `${SIMULATOR_PREFIX}${WORKSPACE_NAME}`
    let simulator = availableSimulators().find(device => device.name === name)
    if (!simulator) {
        log(`creating the simulator "${name}"`)
        const udid = capture('xcrun', ['simctl', 'create', name, SIMULATOR_TYPE, latestIosRuntime()]).trim()
        if (!udid) fail(`could not create the simulator "${name}"`)
        // The first boot of a new simulator never settles on a busy Mac: its home screen stays grey and
        // every app launch hangs. A second boot comes up clean, so the first one is just a setup pass.
        log('setting it up, its first boot takes a few minutes')
        runOrExit('xcrun', ['simctl', 'bootstatus', udid, '-b'], { stdio: 'ignore' })
        runOrExit('xcrun', ['simctl', 'shutdown', udid])
        simulator = { name, udid, state: 'Shutdown' }
    }
    // `simctl boot` returns long before the first boot settles, and an install landing in between
    // hangs the simulator's installd for good.
    if (simulator.state !== 'Booted') log(`booting ${name}`)
    runOrExit('xcrun', ['simctl', 'bootstatus', simulator.udid, '-b'], { stdio: 'ignore' })
    return { name, udid: simulator.udid }
}

// `list devices` reports a cached Developer Mode status, only `info details` asks the phone.
function pickPhone() {
    const phones = (devicectlJson(['list', 'devices'])?.devices ?? []).filter(
        device => device.hardwareProperties?.platform === 'iOS' && device.hardwareProperties?.reality === 'physical' && device.connectionProperties?.pairingState === 'paired',
    )
    const phone = phones.find(device => device.connectionProperties?.tunnelState === 'connected') ?? phones[0]
    if (!phone) fail('no paired iPhone, plug it in and accept "Trust This Computer"')
    const name = phone.deviceProperties.name
    const details = devicectlJson(['device', 'info', 'details', '--device', phone.identifier])
    if (!details) fail(`${name} does not answer, unlock it and keep it on the same Wi-Fi as this Mac (or plug it in)`)
    if (details.deviceProperties?.developerModeStatus !== 'enabled') {
        fail(`Developer Mode is off on ${name}: Settings > Privacy & Security > Developer Mode, then restart the phone`)
    }
    return { name, udid: phone.hardwareProperties.udid, coreDeviceId: phone.identifier }
}

// Xcode fetches the teams of the Apple IDs in Settings > Accounts on demand and only caches them
// once a project picked one, so the team is looked up wherever a previous signing left it:
// LUMVIKA_APPLE_TEAM_ID, the last team this script used, the Xcode cache, the generated project, the
// signing certificate. A free account shows up as a "Personal Team".
function pickTeamId() {
    const remembered = existsSync(TEAM_STAMP) ? readFileSync(TEAM_STAMP, 'utf8').trim() : ''
    const teamId = process.env.LUMVIKA_APPLE_TEAM_ID || remembered || teamFromXcodeCache() || teamFromProject() || teamFromCertificate()
    if (!teamId) {
        spawnSync('open', [join(IOS_DIR, 'Lumvika.xcworkspace')], { stdio: 'ignore' })
        fail(
            'no Apple team found yet. In the Xcode window that just opened: Lumvika target > Signing & Capabilities > Team > "<your name> (Personal Team)", then run this again',
        )
    }
    mkdirSync(DERIVED_DATA_DIR, { recursive: true })
    writeFileSync(TEAM_STAMP, teamId)
    return teamId
}

function teamFromXcodeCache() {
    const raw = capture('plutil', ['-extract', 'IDEProvisioningTeamByIdentifier', 'json', '-o', '-', join(process.env.HOME, 'Library/Preferences/com.apple.dt.Xcode.plist')])
    const teams = raw ? Object.values(JSON.parse(raw)).flat() : []
    return (teams.find(team => team.isFreeProvisioningTeam) ?? teams[0])?.teamID
}

function teamFromProject() {
    const project = join(IOS_DIR, 'Lumvika.xcodeproj/project.pbxproj')
    return existsSync(project) ? readFileSync(project, 'utf8').match(/DEVELOPMENT_TEAM = "?(\w{10})"?;/)?.[1] : undefined
}

function teamFromCertificate() {
    const certificate = capture('security', ['find-certificate', '-c', 'Apple Development', '-p'])
    if (!certificate) return undefined
    const subject = spawnSync('openssl', ['x509', '-noout', '-subject'], { input: certificate, encoding: 'utf8' }).stdout ?? ''
    return subject.match(/OU\s*=\s*(\w{10})/)?.[1]
}

function lanAddress() {
    for (const iface of ['en0', 'en1']) {
        const address = capture('ipconfig', ['getifaddr', iface]).trim()
        if (address) return address
    }
    return 'localhost'
}

// Any HTTP answer counts, a 401 included: it means Next is up and the route is compiled.
async function apiAnswers(timeoutMs) {
    try {
        await fetch(`http://localhost:${API_PORT}/api/v1/me`, { signal: AbortSignal.timeout(timeoutMs) })
        return true
    } catch {
        return false
    }
}

// Detached so that stopping the script can take down the whole pnpm > next tree through its process
// group. Its output is prefixed to stay readable next to Metro's.
function startApi() {
    log(`starting the API (Next) on port ${API_PORT}`)
    const api = spawn('pnpm', ['--filter', 'lumvika', 'exec', 'next', 'dev', '-p', String(API_PORT)], {
        cwd: REPO_ROOT,
        env: { ...process.env, FORCE_COLOR: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: true,
    })
    for (const stream of [api.stdout, api.stderr]) {
        createInterface({ input: stream }).on('line', line => console.log(`[api] ${line}`))
    }
    api.on('exit', code => log(`the API stopped (code ${code ?? 'signal'})`))
    process.on('exit', () => {
        try {
            process.kill(-api.pid, 'SIGTERM')
        } catch {}
    })
}

async function waitForApi() {
    for (let attempt = 0; attempt < 60; attempt++) {
        if (await apiAnswers(60_000)) return true
        await new Promise(done => setTimeout(done, 1000))
    }
    return false
}

// A cold Metro, the first run of a workspace, takes over a minute before it answers.
async function waitForMetro() {
    for (let attempt = 0; attempt < 600; attempt++) {
        try {
            const response = await fetch(`http://localhost:${METRO_PORT}/status`)
            if ((await response.text()).includes('running')) return true
        } catch {}
        await new Promise(done => setTimeout(done, 500))
    }
    return false
}

function nativeInputsHash() {
    const hash = createHash('sha256')
    for (const file of NATIVE_INPUTS) hash.update(readFileSync(join(APP_DIR, file)))
    return hash.digest('hex')
}

// The Xcode version invalidates a client built by an older toolchain, the team a client signed for
// another one.
function clientKey({ sdk, bundleId, teamId }) {
    return createHash('sha256')
        .update(nativeInputsHash())
        .update([sdk, bundleId, teamId ?? ''].join('|'))
        .update(capture('xcodebuild', ['-version']))
        .digest('hex')
}

// Copied under a temporary name then renamed: two workspaces building the same key at once never
// leave a half-copied client, the second rename just finds the entry there and drops its copy.
function storeClient(builtApp, entry) {
    const copy = `${entry}.tmp-${process.pid}`
    rmSync(copy, { recursive: true, force: true })
    runOrExit('ditto', [builtApp, join(copy, 'Lumvika.app')])
    if (forceRebuild) rmSync(entry, { recursive: true, force: true })
    try {
        renameSync(copy, entry)
    } catch {
        rmSync(copy, { recursive: true, force: true })
    }
}

function pruneClients() {
    const entries = readdirSync(CLIENT_CACHE_DIR).map(name => ({ name, path: join(CLIENT_CACHE_DIR, name), modifiedAt: statSync(join(CLIENT_CACHE_DIR, name)).mtimeMs }))
    const staleCopies = entries.filter(entry => entry.name.includes('.tmp-') && Date.now() - entry.modifiedAt > STALE_COPY_MS)
    const oldClients = entries
        .filter(entry => CLIENT_KEY.test(entry.name))
        .sort((a, b) => b.modifiedAt - a.modifiedAt)
        .slice(KEPT_CLIENTS)
    for (const entry of [...staleCopies, ...oldClients]) rmSync(entry.path, { recursive: true, force: true })
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(signal, () => process.exit(130))
}

if (usesLocalApi) {
    if (await apiAnswers(3_000)) log(`reusing the API already served on port ${API_PORT}`)
    else startApi()
} else {
    log(`the app talks to ${remoteApiUrl}`)
}

if (!onDevice) deleteArchivedWorkspaceSimulators()
const target = onDevice ? pickPhone() : workspaceSimulator()
const teamId = onDevice ? pickTeamId() : null
const sdk = onDevice ? 'iphoneos' : 'iphonesimulator'
const builtApp = join(DERIVED_DATA_DIR, `Build/Products/Debug-${sdk}/Lumvika.app`)

if (!onDevice) spawnSync('open', ['-a', 'Simulator'], { stdio: 'ignore' })

const inputsHash = nativeInputsHash()
const prebuildIsCurrent = existsSync(PREBUILD_STAMP) && readFileSync(PREBUILD_STAMP, 'utf8') === inputsHash && existsSync(join(IOS_DIR, 'Lumvika.xcworkspace'))
const bundleId = readBundleId()
const key = clientKey({ sdk, bundleId, teamId })
const clientEntry = join(CLIENT_CACHE_DIR, key)
const cachedApp = join(clientEntry, 'Lumvika.app')
const reusesClient = !forceRebuild && existsSync(cachedApp)

if (reusesClient) {
    log(`reusing the dev client built for this native version (key ${key.slice(0, 8)})`)
    const now = new Date()
    utimesSync(clientEntry, now, now)
} else {
    if (!prebuildIsCurrent) {
        // A merging prebuild can keep a capability the config dropped, but a clean one throws away
        // ios/ and its pods, which costs a full pod install and a cold compile. So the clean pass is
        // what --rebuild buys, and an ordinary edit to app.json only pays for what it changed.
        const clean = forceRebuild ? ['--clean'] : []
        log(`native inputs changed, running expo prebuild${clean.length ? ' --clean' : ''}`)
        runOrExit('pnpm', ['exec', 'expo', 'prebuild', '--platform', 'ios', ...clean])
        mkdirSync(DERIVED_DATA_DIR, { recursive: true })
        writeFileSync(PREBUILD_STAMP, inputsHash)
    }
    log(`building the dev client for ${target.name} (the first build takes a while)`)
    const signing = onDevice ? ['-allowProvisioningUpdates', '-allowProvisioningDeviceRegistration', `DEVELOPMENT_TEAM=${teamId}`, 'CODE_SIGN_STYLE=Automatic'] : []
    await runBuild([
        '-workspace', 'ios/Lumvika.xcworkspace',
        '-scheme', 'Lumvika',
        '-configuration', 'Debug',
        '-sdk', sdk,
        '-destination', `id=${target.udid}`,
        '-derivedDataPath', DERIVED_DATA_DIR,
        '-quiet',
        ...QUIET_WARNINGS,
        ...BUILD_CACHE,
        ...signing,
        'build',
    ])
    mkdirSync(CLIENT_CACHE_DIR, { recursive: true })
    storeClient(builtApp, clientEntry)
    pruneClients()
}

// The app already on a simulator may come from another native version, so it is only kept when this
// script installed it for the same key.
const installedMarker = join(INSTALLED_DIR, target.udid)
const installedKey = existsSync(installedMarker) ? readFileSync(installedMarker, 'utf8') : ''

if (onDevice) {
    log(`installing on ${target.name}`)
    runOrExit('xcrun', ['devicectl', 'device', 'install', 'app', '--device', target.coreDeviceId, cachedApp])
} else if (installedKey !== key || spawnSync('xcrun', ['simctl', 'get_app_container', target.udid, bundleId], { stdio: 'ignore' }).status !== 0) {
    log(`installing on ${target.name}`)
    runOrExit('xcrun', ['simctl', 'install', target.udid, cachedApp])
    mkdirSync(INSTALLED_DIR, { recursive: true })
    writeFileSync(installedMarker, key)
}

if (usesLocalApi) {
    log('waiting for the API to answer')
    if (await waitForApi()) log(`API ready, the app calls ${env.EXPO_PUBLIC_API_URL}`)
    else log(`the API does not answer on port ${API_PORT}, the app will show "Can't reach Lumvika" until it does`)
}

log(`starting Metro on port ${METRO_PORT}`)
// No --ios: Expo would open the app on the first booted simulator of the Mac, not this workspace's.
const metro = spawn('pnpm', ['exec', 'expo', 'start', '--dev-client', ...(onDevice ? ['--host', 'lan'] : []), '--port', String(METRO_PORT)], {
    stdio: 'inherit',
    env,
    cwd: APP_DIR,
})
metro.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 0)))
process.on('exit', () => metro.kill('SIGTERM'))

if (!(await waitForMetro())) {
    log(`Metro does not answer on port ${METRO_PORT}, open Lumvika by hand once it does`)
} else if (onDevice) {
    const bundleUrl = `http://${lanAddress()}:${METRO_PORT}`
    const launch = spawnSync('xcrun', ['devicectl', 'device', 'process', 'launch', '--device', target.coreDeviceId, '--terminate-existing', '--payload-url', `exp+lumvika://expo-development-client/?url=${encodeURIComponent(bundleUrl)}`, bundleId], { stdio: 'ignore', env })
    if (launch.status === 0) {
        log(`Lumvika opened on ${target.name}, the phone must be on the same Wi-Fi as this Mac`)
    } else {
        log(`could not open Lumvika on ${target.name}. A free Apple ID needs a one-time approval on the phone: Settings > General > VPN & Device Management > your Apple ID > Trust. Then open the app or scan the QR code`)
    }
} else {
    // --initialUrl is read by the dev launcher itself: unlike an exp+lumvika:// URL, it skips the
    // "Open in Lumvika?" prompt of a fresh simulator.
    const launch = spawnSync('xcrun', ['simctl', 'launch', '--terminate-running-process', target.udid, bundleId, '--initialUrl', `http://localhost:${METRO_PORT}`], { stdio: 'ignore', env, timeout: 180_000 })
    if (launch.status === 0) log(`Lumvika opened on ${target.name}`)
    else log(`could not open Lumvika on ${target.name}, open it by hand in the simulator`)
}
