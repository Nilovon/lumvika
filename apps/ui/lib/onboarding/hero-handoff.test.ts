import { describe, expect, it } from 'vitest'

import { readHeroAgentApps, readHeroAgentName } from './hero-handoff'

const query = (search: string) => new URLSearchParams(search)

describe('readHeroAgentName', () => {
    it('reads the name the composer sent', () => {
        expect(readHeroAgentName(query('prompt=x&name=Lead+Finder'))).toBe('Lead Finder')
    })

    it('reads nothing from a link that carries only a prompt, or a blank name', () => {
        expect(readHeroAgentName(query('prompt=x'))).toBeNull()
        expect(readHeroAgentName(query('name=++'))).toBeNull()
    })

    it('cuts a name longer than a tile can carry', () => {
        expect(readHeroAgentName(query(`name=${'a'.repeat(80)}`))).toHaveLength(60)
    })
})

describe('readHeroAgentApps', () => {
    it('reads the slugs, once each', () => {
        expect(readHeroAgentApps(query('apps=gmail,hubspot,gmail'))).toEqual(['gmail', 'hubspot'])
    })

    it('reads nothing from a link without apps', () => {
        expect(readHeroAgentApps(query('prompt=x'))).toEqual([])
    })

    it('drops what is not a slug and keeps six at most', () => {
        expect(readHeroAgentApps(query('apps=gmail,<script>,Slack,../etc,google-sheets'))).toEqual(['gmail', 'google-sheets'])
        expect(readHeroAgentApps(query('apps=a,b,c,d,e,f,g,h'))).toHaveLength(6)
    })
})
