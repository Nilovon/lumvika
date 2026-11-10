import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

process.env.RERUN_DATA_DIR = mkdtempSync(resolve(tmpdir(), 'rerun-last-update-'))

const { beforeEach, describe, expect, it } = await import('vitest')
const { readLastUpdate, settleLastUpdateOnBoot, writeLastUpdate } = await import('./last-update.js')
const { buildCommit } = await import('./build-info.js')
const { lastUpdatePath } = await import('../config/paths.js')

beforeEach(() => {
    rmSync(lastUpdatePath(), { force: true })
})

describe('last update record', () => {
    it('is absent on a box that never updated', () => {
        expect(readLastUpdate()).toBeNull()
        expect(settleLastUpdateOnBoot()).toBeNull()
    })

    it('round-trips through the data-dir with a timestamp', () => {
        const written = writeLastUpdate({ status: 'error', commit: 'abc1234', error: 'checksum mismatch' })
        expect(Number.isNaN(Date.parse(written.at))).toBe(false)
        expect(readLastUpdate()).toEqual(written)
        expect(JSON.parse(readFileSync(lastUpdatePath(), 'utf8'))).toEqual(written)
    })

    it('treats an unreadable file as no record', () => {
        writeFileSync(lastUpdatePath(), '{nope')
        expect(readLastUpdate()).toBeNull()
        writeFileSync(lastUpdatePath(), JSON.stringify({ status: 'done' }))
        expect(readLastUpdate()).toBeNull()
    })

    it('leaves a settled record alone on boot', () => {
        const written = writeLastUpdate({ status: 'success', commit: 'abc1234' })
        expect(settleLastUpdateOnBoot()).toEqual(written)
        const failed = writeLastUpdate({ status: 'error', commit: 'abc1234', error: 'disk' })
        expect(settleLastUpdateOnBoot()).toEqual(failed)
    })

    it('turns a restart that came back on the installed commit into a success', () => {
        const commit = buildCommit()
        if (!commit) return
        writeLastUpdate({ status: 'restarting', commit })
        expect(settleLastUpdateOnBoot()).toMatchObject({ status: 'success', commit })
        expect(readLastUpdate()).toMatchObject({ status: 'success' })
    })

    it('records a restart that came back on another commit as an error', () => {
        writeLastUpdate({ status: 'restarting', commit: '0000000' })
        expect(settleLastUpdateOnBoot()).toMatchObject({ status: 'error', commit: '0000000', error: expect.stringContaining('instead of 0000000') })
    })

    it('counts a restart without a target commit as a success', () => {
        writeLastUpdate({ status: 'restarting', commit: null })
        expect(settleLastUpdateOnBoot()).toMatchObject({ status: 'success', commit: buildCommit() })
    })
})
