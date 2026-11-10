import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { transcribeAudio } from '@/lib/ai/transcribe'
import * as engine from '@/lib/engine/client'
import { attachmentTool } from './attachment-tool'
import { downloadAttachment } from './linkup/client'
import { LINKEDIN_TOOLS } from './linkedin/tools'
import { AppToolRefusal, toolParams, type AppToolContext } from './tools'
import { WHATSAPP_TOOLS } from './whatsapp/tools'

vi.mock('./linkup/client', async importOriginal => ({ ...(await importOriginal<typeof import('./linkup/client')>()), downloadAttachment: vi.fn() }))
vi.mock('@/lib/ai/transcribe', () => ({ transcribeAudio: vi.fn() }))
vi.mock('@/lib/engine/client', async importOriginal => ({ ...(await importOriginal<typeof import('@/lib/engine/client')>()), supportsStreamedUploads: vi.fn(), uploadFileStream: vi.fn() }))

const conn = { baseUrl: 'https://box.example', apiKey: 'k' }
const context: AppToolContext = { slug: 'whatsapp', accountId: 'acc', connectionId: 'conn-1', engineAgentId: 'agent-1', engine: async () => conn }
const tool = attachmentTool('attachment_download')

function voiceNote() {
    return { body: new Response('opus-bytes').body!, contentType: 'audio/ogg; codecs=opus', filename: null, size: 10 }
}

async function run(args: Record<string, unknown>) {
    return tool.run!(context, toolParams(tool, args)) as Promise<Record<string, unknown>>
}

describe('download_attachment', () => {
    beforeEach(() => {
        vi.stubEnv('APP_ATTACHMENT_URL_SECRET', 'secret')
        vi.mocked(downloadAttachment).mockReset().mockResolvedValue(voiceNote())
        vi.mocked(transcribeAudio).mockReset().mockResolvedValue('Rappelle-moi demain')
        vi.mocked(engine.supportsStreamedUploads).mockReset().mockResolvedValue(true)
        vi.mocked(engine.uploadFileStream).mockReset().mockImplementation(async (_conn, _base, input) => {
            const bytes = (await new Response(input.body).arrayBuffer()).byteLength
            return { path: `${input.dir}/${input.name}`, bytes }
        })
    })

    afterEach(() => {
        vi.unstubAllEnvs()
    })

    it('is offered by both apps and metered', () => {
        for (const tools of [WHATSAPP_TOOLS, LINKEDIN_TOOLS]) {
            const offered = tools.find(candidate => candidate.name === 'download_attachment')
            expect(offered?.quota?.action).toBe('attachment_download')
            expect(offered?.run).toBeTypeOf('function')
        }
    })

    it('copies the file into the coworker’s files, links it and transcribes it', async () => {
        const result = await run({ download_url: '/v2/messages/attachment?account_id=someone-else&message_id=3EB0', transcribe: true })
        expect(downloadAttachment).toHaveBeenCalledWith('acc', { message_id: '3EB0' })
        expect(engine.uploadFileStream).toHaveBeenCalledWith(conn, '/agents/agent-1/files', expect.objectContaining({ dir: 'attachments/whatsapp', size: 10 }))
        expect(transcribeAudio).toHaveBeenCalledWith(Buffer.from('opus-bytes'), 'ogg', expect.any(AbortSignal))
        expect(result).toMatchObject({ name: 'attachment-3EB0.ogg', mimeType: 'audio/ogg', size: 10, transcript: 'Rappelle-moi demain' })
        expect(result.path).toMatch(/^attachments\/whatsapp\/\d{8}-\d{6}-attachment-3EB0\.ogg$/)
        expect(result.url).toMatch(/^https:\/\/.+\/api\/public\/attachments\/.+\/attachment-3EB0\.ogg$/)
    })

    it('transcribes only when asked, and only audio', async () => {
        await run({ message_id: '3EB0' })
        expect(transcribeAudio).not.toHaveBeenCalled()
        vi.mocked(downloadAttachment).mockResolvedValue({ body: new Response('%PDF').body!, contentType: 'application/pdf', filename: 'devis.pdf', size: 4 })
        const pdf = await run({ message_id: '3EB1', transcribe: true })
        expect(pdf).toMatchObject({ name: 'devis.pdf', transcriptError: 'Only a voice note or an audio file can be transcribed.' })
    })

    it('still links the file when the machine cannot take it', async () => {
        vi.mocked(engine.supportsStreamedUploads).mockResolvedValue(false)
        const result = await run({ message_id: '3EB0', transcribe: true })
        expect(result).toMatchObject({ fileError: expect.stringContaining('Use the url'), transcript: 'Rappelle-moi demain' })
        expect(result.url).toBeTruthy()
        expect(result.path).toBeUndefined()
    })

    it('refuses LinkedIn’s private link or nothing at all', async () => {
        await expect(run({ download_url: 'https://media.licdn.com/dms/document/abc' })).rejects.toBeInstanceOf(AppToolRefusal)
        await expect(run({})).rejects.toBeInstanceOf(AppToolRefusal)
        expect(downloadAttachment).not.toHaveBeenCalled()
    })
})
