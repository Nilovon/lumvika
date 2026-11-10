#!/usr/bin/env node
// The raw screens of the App Store screenshots, taken in this workspace's simulator from the app's lab
// routes (mock data, no account), in light and dark, into the web lab that frames them:
// apps/ui/app/render/lab/app-store.
//
//   pnpm dev:mobile                                   first, so the app runs in "Rerun · <workspace>"
//   node apps/mobile/scripts/capture-store-shots.mjs [only-this-capture ...]
//
// The Expo dev menu's floating button and its launch onboarding must be off, or they land in every
// shot: `xcrun simctl spawn <udid> defaults write build.rerun.app.dev EXDevMenuShowFloatingActionButton
// -bool NO`, same with `EXDevMenuIsOnboardingFinished -bool YES`, then relaunch the app. The status
// bar reads 9:41 only with a 12-hour locale (`defaults write -g AppleLocale en_US`, then reboot the
// simulator).

import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const OUT_DIR = join(REPO_ROOT, 'apps/ui/public/render-lab/app-store')
const WORKSPACE_NAME = process.env.CONDUCTOR_WORKSPACE_NAME || basename(REPO_ROOT)
const SIMULATOR_NAME = `Rerun · ${WORKSPACE_NAME}`
const APPEARANCES = ['light', 'dark']
const DEV_BUNDLE_ID = 'build.rerun.app.dev'
const METRO_URL = `http://localhost:${Number(process.env.CONDUCTOR_PORT ?? 3050) + 2}`
// A fresh launch per shot: a deep link pushes on top of the previous screen, sheets included.
const LAUNCH_MS = 9000
// Long enough for a sheet or the Foreman overlay to finish opening and the buddies to settle.
const SETTLE_MS = 5000

const CAPTURES = [
    { id: 'home', url: 'rerun://lab-foreman?state=conversation' },
    { id: 'manager', url: 'rerun://lab-foreman?state=conversation&open=1' },
    { id: 'working', url: 'rerun://lab-chat?tabs=3&active=0&state=running' },
    { id: 'approval', url: 'rerun://lab-chat?tabs=3&active=1&state=approval' },
    // A sheet, opened over the home as in the app rather than over the launch screen.
    { id: 'providers', over: 'rerun://lab-foreman?state=conversation', url: 'rerun://lab-providers?state=keys' },
]

function simctl(...args) {
    const result = spawnSync('xcrun', ['simctl', ...args], { encoding: 'utf8' })
    if (result.status !== 0) throw new Error(`simctl ${args[0]} failed: ${result.stderr.trim()}`)
    return result.stdout
}

function simulatorUdid() {
    const { devices } = JSON.parse(simctl('list', 'devices', '--json'))
    const device = Object.values(devices)
        .flat()
        .find(candidate => candidate.name === SIMULATOR_NAME && candidate.state === 'Booted')
    if (!device) throw new Error(`"${SIMULATOR_NAME}" is not booted, start it with pnpm dev:mobile`)
    return device.udid
}

const wait = ms => new Promise(done => setTimeout(done, ms))

// iOS asks "Open in “Rerun”?" before a deep link reaches the app; axe answers it when installed.
async function openUrl(udid, url) {
    simctl('openurl', udid, url)
    await wait(1500)
    spawnSync('axe', ['tap', '--label', 'Open', '--udid', udid], { encoding: 'utf8' })
}

const udid = simulatorUdid()
const only = process.argv.slice(2)
const captures = only.length ? CAPTURES.filter(capture => only.includes(capture.id)) : CAPTURES

simctl('status_bar', udid, 'override', '--time', '9:41', '--batteryState', 'discharging', '--batteryLevel', '100', '--cellularBars', '4', '--wifiBars', '3', '--dataNetwork', 'wifi')

for (const appearance of APPEARANCES) {
    simctl('ui', udid, 'appearance', appearance)
    mkdirSync(join(OUT_DIR, appearance), { recursive: true })
    for (const capture of captures) {
        simctl('launch', '--terminate-running-process', udid, DEV_BUNDLE_ID, '--initialUrl', METRO_URL)
        await wait(LAUNCH_MS)
        if (capture.over) {
            await openUrl(udid, capture.over)
            await wait(SETTLE_MS)
        }
        await openUrl(udid, capture.url)
        await wait(SETTLE_MS)
        const file = join(OUT_DIR, appearance, `${capture.id}.png`)
        simctl('io', udid, 'screenshot', '--type=png', file)
        console.log(`${appearance}/${capture.id}.png`)
    }
}
