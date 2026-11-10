import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

process.env.LUMVIKA_DATA_DIR = mkdtempSync(resolve(tmpdir(), 'lumvika-messages-'))
process.env.LUMVIKA_API_KEY = ''

const { describe, expect, it } = await import('vitest')
const { appendMessage, listMessages, setMessageToolCalls } = await import('./messages.js')

describe('setMessageToolCalls', () => {
    it('writes the calls beside the row and leaves its content alone', async () => {
        const row = await appendMessage('calls', 's1', { role: 'assistant', content: [{ type: 'text', text: 'Done.' }] })
        const other = await appendMessage('calls', 's1', { role: 'assistant', content: 'Later.' })

        await setMessageToolCalls('calls', row.id, [{ toolCallId: 'q1', toolName: 'suggest_replies', input: { replies: ['Find 100 more'] } }])

        const rows = await listMessages('calls', 's1')
        expect(rows.find(r => r.id === row.id)).toMatchObject({ contentJson: JSON.stringify([{ type: 'text', text: 'Done.' }]), toolCallsJson: JSON.stringify([{ toolCallId: 'q1', toolName: 'suggest_replies', input: { replies: ['Find 100 more'] } }]) })
        expect(rows.find(r => r.id === other.id)?.toolCallsJson).toBeNull()
    })
})
