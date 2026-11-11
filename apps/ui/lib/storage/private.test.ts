import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { fakeScope } from '@/test/db-fake'

const downloadObject = vi.fn()
vi.mock('@lumvika/storage', () => ({ downloadObject: (...args: unknown[]) => downloadObject(...args), removeObjects: vi.fn(), uploadObject: vi.fn() }))

const { downloadPrivateFile, STORAGE_BUSY_ERROR } = await import('./private')

const SLOW_DOWN = { data: null, error: { message: 'Please reduce your request rate.' } }
const NOT_FOUND = { data: null, error: { message: 'The specified key does not exist.' } }
const archive = () => ({ data: new TextEncoder().encode('tarball'), error: null })

let warn: ReturnType<typeof vi.spyOn>

function answer(...responses: (() => unknown)[]) {
    responses.forEach(response => downloadObject.mockImplementationOnce(async () => response()))
}

async function download(): Promise<Blob> {
    const pending = downloadPrivateFile(fakeScope(), 'agent-archives', 'template/agent/archive.tar.gz')
    pending.catch(() => {})
    await vi.runAllTimersAsync()
    return pending
}

describe('downloadPrivateFile', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        downloadObject.mockReset()
        warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    })

    afterEach(() => {
        vi.useRealTimers()
        warn.mockRestore()
    })

    it('downloads again when storage refuses for a moment', async () => {
        answer(
            () => SLOW_DOWN,
            () => archive()
        )

        const blob = await download()

        expect(await blob.text()).toBe('tarball')
        expect(downloadObject).toHaveBeenCalledTimes(2)
        expect(downloadObject).toHaveBeenCalledWith('agent-archives', 'template/agent/archive.tar.gz')
    })

    it('gives up with a sentence a user can read once storage stays saturated', async () => {
        answer(...Array.from({ length: 4 }, () => () => SLOW_DOWN))

        const error = await download().catch((err: Error) => err)

        expect(error).toBeInstanceOf(Error)
        expect((error as Error).message).toBe(STORAGE_BUSY_ERROR)
        expect(STORAGE_BUSY_ERROR).not.toMatch(/database|connection/i)
        expect(downloadObject).toHaveBeenCalledTimes(4)
        expect((error as Error).cause).toMatchObject({ message: 'Please reduce your request rate.' })
        expect(warn).toHaveBeenCalledOnce()
        expect(warn).toHaveBeenCalledWith(expect.any(String), 'agent-archives', 'template/agent/archive.tar.gz', 'Please reduce your request rate.')
    })

    it('fails at once on a missing object', async () => {
        answer(() => NOT_FOUND)

        await expect(download()).rejects.toThrow('The specified key does not exist.')
        expect(downloadObject).toHaveBeenCalledTimes(1)
        expect(warn).not.toHaveBeenCalled()
    })
})
