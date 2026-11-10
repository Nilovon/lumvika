import { createServer, type Server } from 'node:http'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export type HubMode = 'real' | 'synthetic' | 'none' | 'down' | 'hang' | 'wrong-dims'

const DIMS = 1536
const EMBED_MODEL = 'openai/text-embedding-3-small'

function syntheticVector(text: string): number[] {
    const out = new Array<number>(DIMS)
    let seed = createHash('sha256').update(text).digest().readUInt32LE(0)
    let norm = 0
    for (let i = 0; i < DIMS; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
        const v = seed / 0xffffffff - 0.5
        out[i] = v
        norm += v * v
    }
    norm = Math.sqrt(norm)
    return out.map(v => v / norm)
}

export function startStubHub(opts: { openrouterKey: string | undefined; cachePath: string }) {
    let mode: HubMode = 'real'
    let embedCalls = 0
    const cache: Record<string, number[]> = existsSync(opts.cachePath) ? JSON.parse(readFileSync(opts.cachePath, 'utf8')) : {}
    let dirty = false

    async function realVector(text: string): Promise<number[]> {
        const hit = cache[text]
        if (hit) return hit
        if (!opts.openrouterKey) throw new Error('OPENROUTER_API_KEY missing: real embeddings unavailable')
        const res = await fetch('https://openrouter.ai/api/v1/embeddings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opts.openrouterKey}` },
            body: JSON.stringify({ model: EMBED_MODEL, input: text }),
        })
        if (!res.ok) throw new Error(`embeddings upstream ${res.status}`)
        const data = (await res.json()) as { data: { embedding: number[] }[] }
        const vector = data.data[0]!.embedding
        cache[text] = vector
        dirty = true
        return vector
    }

    const server: Server = createServer((req, res) => {
        if (req.method !== 'POST' || req.url !== '/api/embed') {
            res.writeHead(404).end()
            return
        }
        let raw = ''
        req.on('data', chunk => (raw += chunk))
        req.on('end', async () => {
            embedCalls++
            const send = (status: number, body: unknown) => res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body))
            try {
                if (mode === 'hang') return
                if (mode === 'down') return send(503, { error: 'unavailable' })
                if (mode === 'none') return send(200, { embedding: null })
                const { text } = JSON.parse(raw) as { text: string }
                if (mode === 'wrong-dims') return send(200, { embedding: syntheticVector(text).slice(0, 768) })
                if (mode === 'synthetic') return send(200, { embedding: syntheticVector(text) })
                return send(200, { embedding: await realVector(text) })
            } catch (err) {
                send(500, { error: String(err) })
            }
        })
    })

    return {
        listen: () =>
            new Promise<string>(resolvePort => {
                server.listen(0, '127.0.0.1', () => {
                    const address = server.address()
                    resolvePort(`http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`)
                })
            }),
        setMode: (next: HubMode) => {
            mode = next
        },
        embedCalls: () => embedCalls,
        embed: realVector,
        close: () => {
            if (dirty) {
                mkdirSync(dirname(opts.cachePath), { recursive: true })
                writeFileSync(opts.cachePath, JSON.stringify(cache))
            }
            server.closeAllConnections()
            server.close()
        },
    }
}
