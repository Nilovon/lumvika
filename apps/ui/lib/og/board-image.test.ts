import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { boardAgentsOfScene, boardImageUrl, type BoardScene, readBoardImageRequest, signedBoardImageQuery } from './board-image'

const SCENE: BoardScene = {
    agents: [
        { name: 'Scout', status: 'working', connectors: ['gmail', 'notion'] },
        { name: 'Writer' },
    ],
    highlight: ['notion'],
}

beforeEach(() => vi.stubEnv('BOARD_IMAGE_SECRET', 'test-board-image-secret'))
afterEach(() => vi.unstubAllEnvs())

const searchOf = (url: string) => new URL(url).searchParams

describe('boardImageUrl', () => {
    it('reads back the scene and the options it was built with', () => {
        const url = boardImageUrl(SCENE, { width: 800, height: 600, theme: 'light', zoom: 2, format: 'webp' }, 'https://app.test')

        expect(url.startsWith('https://app.test/og/board?')).toBe(true)
        expect(readBoardImageRequest(searchOf(url))).toMatchObject({ scene: SCENE, width: 800, height: 600, theme: 'light', zoom: 2, format: 'webp' })
    })

    it('falls back to the card frame, dark, as a PNG', () => {
        expect(readBoardImageRequest(searchOf(boardImageUrl(SCENE, {}, 'https://app.test')))).toMatchObject({ width: 1200, height: 630, theme: 'dark', format: 'png' })
    })

    it('refuses a scene or a size out of bounds', () => {
        expect(() => boardImageUrl({ agents: [] })).toThrow()
        expect(() => boardImageUrl({ agents: Array.from({ length: 9 }, (_, index) => ({ name: `Agent ${index}` })) })).toThrow()
        expect(() => boardImageUrl(SCENE, { width: 5000 })).toThrow()
    })
})

describe('readBoardImageRequest', () => {
    it('does not depend on the order of the parameters', () => {
        const reversed = new URLSearchParams([...new URLSearchParams(signedBoardImageQuery(SCENE, { width: 800 }))].reverse())

        expect(readBoardImageRequest(reversed)).toMatchObject({ width: 800 })
    })

    it('ignores a parameter that is not part of the picture', () => {
        const search = new URLSearchParams(signedBoardImageQuery(SCENE))
        search.set('v', '15')
        search.set('refresh', '1')

        expect(readBoardImageRequest(search)).not.toBeNull()
    })

    it('hands on a query that verifies again', () => {
        const request = readBoardImageRequest(new URLSearchParams(signedBoardImageQuery(SCENE, { theme: 'light' })))

        expect(readBoardImageRequest(new URLSearchParams(request?.query))).toMatchObject({ theme: 'light' })
    })

    it('rejects a missing or altered signature', () => {
        const unsigned = new URLSearchParams(signedBoardImageQuery(SCENE))
        unsigned.delete('sig')
        const altered = new URLSearchParams(signedBoardImageQuery(SCENE))
        altered.set('sig', `${altered.get('sig')}x`)

        expect(readBoardImageRequest(unsigned)).toBeNull()
        expect(readBoardImageRequest(altered)).toBeNull()
    })

    it('rejects a parameter changed or added after signing', () => {
        const resized = new URLSearchParams(signedBoardImageQuery(SCENE, { width: 800 }))
        resized.set('w', '2000')
        const rethemed = new URLSearchParams(signedBoardImageQuery(SCENE))
        rethemed.set('theme', 'light')
        const rewritten = new URLSearchParams(signedBoardImageQuery(SCENE))
        rewritten.set('scene', Buffer.from(JSON.stringify({ agents: [{ name: 'Forged' }] })).toString('base64url'))

        expect(readBoardImageRequest(resized)).toBeNull()
        expect(readBoardImageRequest(rethemed)).toBeNull()
        expect(readBoardImageRequest(rewritten)).toBeNull()
    })
})

describe('boardAgentsOfScene', () => {
    it('keeps only the apps the catalog knows', () => {
        const [scout, writer] = boardAgentsOfScene({ agents: [{ name: 'Scout', status: 'working', connectors: ['gmail', 'unknown'] }, { name: 'Writer' }] }, new Set(['gmail']))

        expect(scout).toEqual({ key: 'Scout', name: 'Scout', status: 'working', connectorSlugs: ['gmail'] })
        expect(writer.connectorSlugs).toEqual([])
    })

    it('gives two coworkers of the same name a tile each', () => {
        const keys = boardAgentsOfScene({ agents: [{ name: 'Scout' }, { name: 'Scout' }] }, new Set()).map(agent => agent.key)

        expect(new Set(keys).size).toBe(2)
    })
})
