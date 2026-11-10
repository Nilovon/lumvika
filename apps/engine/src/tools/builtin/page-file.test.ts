import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, truncateSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'

process.env.LUMVIKA_DATA_DIR = mkdtempSync(resolve(tmpdir(), 'lumvika-page-file-'))

const { afterAll, describe, expect, it } = await import('vitest')
const { workspaceDir } = await import('../../config/paths.js')
const { pageFileBase, savePage, textExtension } = await import('./page-file.js')

const inWorkspace = (agentId: string, path: string) => resolve(workspaceDir(agentId), path)

afterAll(() => rmSync(process.env.LUMVIKA_DATA_DIR!, { recursive: true, force: true }))

describe('pageFileBase', () => {
    it('mirrors the path of the URL under its host', () => {
        expect(pageFileBase('https://altarflow.com/')).toBe('altarflow.com/index')
        expect(pageFileBase('https://altarflow.com/es')).toBe('altarflow.com/es')
        expect(pageFileBase('https://altarflow.com/blog/')).toBe('altarflow.com/blog/index')
        expect(pageFileBase('https://altarflow.com/blog/post.html')).toBe('altarflow.com/blog/post.html')
        expect(pageFileBase('http://localhost:3000/a')).toBe('localhost_3000/a')
    })

    it('tells apart URLs that only differ by a query or by characters a file name cannot keep', () => {
        const withQuery = pageFileBase('https://shop.test/list?page=2')
        expect(withQuery).toMatch(/^shop\.test\/list-[0-9a-f]{8}$/)
        expect(withQuery).not.toBe(pageFileBase('https://shop.test/list?page=3'))
        expect(pageFileBase('https://shop.test/caf%C3%A9')).not.toBe(pageFileBase('https://shop.test/caf_C3_A9'))
    })

    it('keeps a very long segment short', () => {
        const base = pageFileBase(`https://long.test/${'a'.repeat(300)}`)
        expect(base.split('/')[1].length).toBeLessThanOrEqual(89)
    })
})

describe('textExtension', () => {
    it('names a text body by its content type and refuses a binary one', () => {
        expect(textExtension('text/html; charset=utf-8')).toBe('html')
        expect(textExtension('application/xml')).toBe('xml')
        expect(textExtension('application/ld+json')).toBe('json')
        expect(textExtension('text/plain')).toBe('txt')
        expect(textExtension(null)).toBe('txt')
        expect(textExtension('image/png')).toBeNull()
        expect(textExtension('application/pdf')).toBeNull()
    })
})

describe('savePage', () => {
    it('writes the body and a meta file next to it, and says where', async () => {
        const saved = await savePage('reader', { url: 'https://altarflow.com/es', view: 'served', body: '<html>hola</html>', ext: 'html', status: 200, finalUrl: 'https://altarflow.com/es', contentType: 'text/html', xRobotsTag: 'noindex' })

        expect(saved).toBe('.lumvika/pages/altarflow.com/es.served.html')
        expect(readFileSync(inWorkspace('reader', saved!), 'utf8')).toBe('<html>hola</html>')
        const meta = JSON.parse(readFileSync(inWorkspace('reader', '.lumvika/pages/altarflow.com/es.meta.json'), 'utf8'))
        expect(meta).toMatchObject({ url: 'https://altarflow.com/es', views: { served: { file: saved, status: 200, contentType: 'text/html', xRobotsTag: 'noindex' } } })
        expect(meta.views.served.finalUrl).toBeUndefined()
    })

    it('keeps each view of a page side by side and overwrites a view read again', async () => {
        const url = 'https://mometic.com/'
        await savePage('differ', { url, view: 'served', body: 'first', ext: 'html' })
        await savePage('differ', { url, view: 'rendered', body: 'rendered', ext: 'html' })
        await savePage('differ', { url, view: 'served', body: 'second', ext: 'html' })

        expect(readFileSync(inWorkspace('differ', '.lumvika/pages/mometic.com/index.served.html'), 'utf8')).toBe('second')
        expect(readFileSync(inWorkspace('differ', '.lumvika/pages/mometic.com/index.rendered.html'), 'utf8')).toBe('rendered')
        const meta = JSON.parse(readFileSync(inWorkspace('differ', '.lumvika/pages/mometic.com/index.meta.json'), 'utf8'))
        expect(Object.keys(meta.views).sort()).toEqual(['rendered', 'served'])
    })

    it('never lets two URLs that land on the same name share a file', async () => {
        const root = await savePage('twins', { url: 'https://twins.test/', view: 'served', body: 'root', ext: 'html' })
        const index = await savePage('twins', { url: 'https://twins.test/index', view: 'served', body: 'index', ext: 'html' })

        expect(root).toBe('.lumvika/pages/twins.test/index.served.html')
        expect(index).toMatch(/^\.lumvika\/pages\/twins\.test\/index-[0-9a-f]{8}\.served\.html$/)
        expect(readFileSync(inWorkspace('twins', root!), 'utf8')).toBe('root')
        expect(readFileSync(inWorkspace('twins', index!), 'utf8')).toBe('index')
    })

    it('drops pages older than 30 days and the folders they leave empty', async () => {
        const old = inWorkspace('pruner', '.lumvika/pages/old.test/page.served.html')
        mkdirSync(dirname(old), { recursive: true })
        writeFileSync(old, 'old')
        const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000)
        utimesSync(old, fortyDaysAgo, fortyDaysAgo)

        await savePage('pruner', { url: 'https://new.test/', view: 'served', body: 'new', ext: 'html' })

        expect(existsSync(old)).toBe(false)
        expect(existsSync(dirname(old))).toBe(false)
        expect(existsSync(inWorkspace('pruner', '.lumvika/pages/new.test/index.served.html'))).toBe(true)
    })

    it('drops the oldest pages once they weigh more than 200 MB together', async () => {
        const big = (name: string, daysAgo: number) => {
            const path = inWorkspace('heavy', `.lumvika/pages/big.test/${name}.served.html`)
            mkdirSync(dirname(path), { recursive: true })
            writeFileSync(path, '')
            truncateSync(path, 110 * 1024 * 1024)
            const at = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000)
            utimesSync(path, at, at)
            return path
        }
        const older = big('older', 2)
        const newer = big('newer', 1)

        await savePage('heavy', { url: 'https://big.test/latest', view: 'served', body: 'latest', ext: 'html' })

        expect(existsSync(older)).toBe(false)
        expect(existsSync(newer)).toBe(true)
    })

    it('prunes on the first save of an agent, then once in twenty', async () => {
        const old = inWorkspace('sampler', '.lumvika/pages/old.test/page.served.html')
        const stale = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000)
        const save = (n: number) => savePage('sampler', { url: `https://new.test/p${n}`, view: 'served', body: 'new', ext: 'html' })

        await save(0)
        mkdirSync(dirname(old), { recursive: true })
        writeFileSync(old, 'old')
        utimesSync(old, stale, stale)
        for (let n = 1; n < 20; n++) await save(n)
        expect(existsSync(old)).toBe(true)

        await save(20)
        expect(existsSync(old)).toBe(false)
    })

    it('answers null instead of failing when the page cannot be written', async () => {
        const blocker = inWorkspace('blocked', '.lumvika/pages')
        mkdirSync(dirname(blocker), { recursive: true })
        writeFileSync(blocker, 'a file where the folder should be')

        expect(await savePage('blocked', { url: 'https://any.test/', view: 'served', body: 'x', ext: 'html' })).toBeNull()
    })
})
