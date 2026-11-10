// The cap is shared with the iOS recorder, so it lives in contracts.
export { MAX_RECORDING_MS } from '@lumvika/contracts'

// 32 kbps is plenty for speech in AAC or Opus and keeps 5 minutes around 1.2 MB, well under the
// 10 MB the middleware truncates request bodies at (see proxy.ts).
export const RECORDING_BITS_PER_SECOND = 32_000

export type RecordingFormat = {
    /** What MediaRecorder is asked to produce. */
    mimeType: string
    /** File extension, which is also what the file proxy reads the Content-Type from. */
    extension: string
    /** `input_audio.format` for the transcription API. */
    transcriptionFormat: string
}

// Ordered by preference: AAC in mp4 first, because the iOS app cannot play webm. AAC is asked for
// by name since a bare `audio/mp4` in Chrome may carry Opus, which iOS cannot play either.
const CANDIDATES: readonly RecordingFormat[] = [
    { mimeType: 'audio/mp4;codecs=mp4a.40.2', extension: 'm4a', transcriptionFormat: 'm4a' },
    { mimeType: 'audio/webm;codecs=opus', extension: 'webm', transcriptionFormat: 'webm' },
    { mimeType: 'audio/webm', extension: 'webm', transcriptionFormat: 'webm' },
    { mimeType: 'audio/mp4', extension: 'm4a', transcriptionFormat: 'm4a' },
    { mimeType: 'audio/ogg;codecs=opus', extension: 'ogg', transcriptionFormat: 'ogg' },
]

export const TRANSCRIPTION_FORMATS = new Set(CANDIDATES.map(c => c.transcriptionFormat))

// Arc (Chromium 155) answers yes to AAC in isTypeSupported, then fails every recording with
// `EncodingError: Internal Error`. A format seen failing is remembered so this browser stops trying it.
const BROKEN_FORMATS_KEY = 'lumvika:voice:broken-formats'

function readBrokenFormats(): string[] {
    try {
        const stored: unknown = JSON.parse(localStorage.getItem(BROKEN_FORMATS_KEY) ?? '[]')
        return Array.isArray(stored) ? stored.filter((item): item is string => typeof item === 'string') : []
    } catch {
        return []
    }
}

export function markRecordingFormatBroken(mimeType: string) {
    try {
        const broken = readBrokenFormats()
        if (!broken.includes(mimeType)) localStorage.setItem(BROKEN_FORMATS_KEY, JSON.stringify([...broken, mimeType]))
    } catch {}
}

function defaultIsTypeSupported(mimeType: string): boolean {
    return typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mimeType) && !readBrokenFormats().includes(mimeType)
}

/** The first format this browser can record, or null when none of them work. */
export function pickRecordingFormat(isTypeSupported: (mimeType: string) => boolean = defaultIsTypeSupported): RecordingFormat | null {
    return CANDIDATES.find(candidate => isTypeSupported(candidate.mimeType)) ?? null
}

/** The next format after `primary`, recorded alongside it in case the browser cannot actually encode the first one. */
export function pickBackupFormat(primary: RecordingFormat, isTypeSupported: (mimeType: string) => boolean = defaultIsTypeSupported): RecordingFormat | null {
    const after = CANDIDATES.slice(CANDIDATES.findIndex(candidate => candidate.mimeType === primary.mimeType) + 1)
    return after.find(candidate => isTypeSupported(candidate.mimeType)) ?? null
}
