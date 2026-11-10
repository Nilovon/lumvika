import { Readable, Writable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { describe, expect, it } from 'vitest'
import { capAt } from './stream.js'
import { HttpError } from './errors.js'

const tooBig = (max: number) => `Body exceeds ${max} bytes`

async function pump(chunks: Buffer[], max: number): Promise<Buffer> {
    const received: Buffer[] = []
    await pipeline(
        Readable.from(chunks),
        capAt(max, tooBig),
        new Writable({
            write(chunk: Buffer, _encoding, callback) {
                received.push(chunk)
                callback()
            },
        })
    )
    return Buffer.concat(received)
}

describe('capAt', () => {
    it('passes a body of exactly the limit through untouched', async () => {
        const body = Buffer.from('a'.repeat(10))
        expect(await pump([body], 10)).toEqual(body)
    })

    it('rejects one byte over the limit with a 400 carrying the message', async () => {
        const err = await pump([Buffer.from('a'.repeat(11))], 10).catch(e => e)
        expect(err).toBeInstanceOf(HttpError)
        expect(err.status).toBe(400)
        expect(err.message).toBe('Body exceeds 10 bytes')
    })

    it('counts bytes across chunks', async () => {
        const chunks = [Buffer.from('aaaa'), Buffer.from('bbbb'), Buffer.from('cc')]
        expect((await pump(chunks, 10)).toString()).toBe('aaaabbbbcc')
        const err = await pump([...chunks, Buffer.from('d')], 10).catch(e => e)
        expect(err).toBeInstanceOf(HttpError)
        expect(err.status).toBe(400)
    })

    it('counts bytes, not characters', async () => {
        const err = await pump([Buffer.from('ééé')], 5).catch(e => e)
        expect(err).toBeInstanceOf(HttpError)
    })

    it('passes an empty body', async () => {
        expect(await pump([], 0)).toEqual(Buffer.alloc(0))
    })
})
