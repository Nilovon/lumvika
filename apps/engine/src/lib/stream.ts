import { Transform } from 'node:stream'
import { badRequest } from './errors.js'

// Nothing has told us the real size yet: Content-Length is the sender's word, and a chunked body
// carries no size at all. Counting the bytes as they flow is the only cap that cannot be lied to.
export function capAt(maxBytes: number, message: (maxBytes: number) => string): Transform {
    let seen = 0
    return new Transform({
        transform(chunk: Buffer, _encoding, callback) {
            seen += chunk.byteLength
            if (seen > maxBytes) return callback(badRequest(message(maxBytes)))
            callback(null, chunk)
        },
    })
}
