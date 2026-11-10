import { afterEach, describe, expect, it, vi } from 'vitest'
import { markRecordingFormatBroken, pickBackupFormat, pickRecordingFormat } from './recording'

describe('pickRecordingFormat', () => {
    it('prefers AAC in mp4', () => {
        const format = pickRecordingFormat(() => true)
        expect(format?.mimeType).toBe('audio/mp4;codecs=mp4a.40.2')
        expect(format?.extension).toBe('m4a')
    })

    it('falls back to opus in webm when AAC cannot be recorded', () => {
        expect(pickRecordingFormat(mime => mime.startsWith('audio/webm'))?.mimeType).toBe('audio/webm;codecs=opus')
    })

    it('falls back to mp4 on Safari', () => {
        const format = pickRecordingFormat(mime => mime === 'audio/mp4')
        expect(format?.extension).toBe('m4a')
        expect(format?.transcriptionFormat).toBe('m4a')
    })

    it('returns null when the browser records nothing we can transcribe', () => {
        expect(pickRecordingFormat(() => false)).toBeNull()
    })
})

describe('pickBackupFormat', () => {
    it('backs AAC up with opus in webm', () => {
        const primary = pickRecordingFormat(() => true)!
        expect(pickBackupFormat(primary, () => true)?.mimeType).toBe('audio/webm;codecs=opus')
    })

    it('returns null when nothing else can be recorded', () => {
        const primary = pickRecordingFormat(mime => mime === 'audio/mp4')!
        expect(pickBackupFormat(primary, mime => mime === 'audio/mp4')).toBeNull()
    })
})

describe('markRecordingFormatBroken', () => {
    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('stops picking a format the browser claimed but failed to encode', () => {
        const store = new Map<string, string>()
        vi.stubGlobal('localStorage', { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => store.set(key, value) })
        vi.stubGlobal('MediaRecorder', { isTypeSupported: () => true })

        expect(pickRecordingFormat()?.mimeType).toBe('audio/mp4;codecs=mp4a.40.2')
        markRecordingFormatBroken('audio/mp4;codecs=mp4a.40.2')
        expect(pickRecordingFormat()?.mimeType).toBe('audio/webm;codecs=opus')
    })
})
