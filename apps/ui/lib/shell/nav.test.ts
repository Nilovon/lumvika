import { describe, expect, it } from 'vitest'

import { NAV_GROUPS, NAV_ITEMS, activeNavItemId, isNavHrefActive } from './nav'

describe('the nav registry', () => {
    it('lists the areas in their order, with the routes the feature screens rely on', () => {
        expect(NAV_ITEMS.map(item => [item.id, item.href])).toEqual([
            ['overview', '/overview'],
            ['office', '/'],
            ['chat', '/chat'],
            ['work', '/work'],
            ['projects', '/projects'],
            ['goals', '/goals'],
            ['review', '/review'],
            ['channels', '/channels'],
            ['teams', '/teams'],
            ['activity', '/activity'],
        ])
    })

    it('titles only the Work and Collaborate groups', () => {
        expect(NAV_GROUPS.map(group => group.heading)).toEqual([null, 'work', 'collaborate', null])
    })
})

describe('isNavHrefActive', () => {
    it('keeps the board to `/` alone', () => {
        expect(isNavHrefActive('/', '/')).toBe(true)
        expect(isNavHrefActive('/projects', '/')).toBe(false)
    })

    it('lights an area on its own page and everything under it', () => {
        expect(isNavHrefActive('/projects', '/projects')).toBe(true)
        expect(isNavHrefActive('/projects/LUM', '/projects')).toBe(true)
        expect(isNavHrefActive('/chat/abc', '/chat')).toBe(true)
    })

    it('does not light an area on a route that only starts with its name', () => {
        expect(isNavHrefActive('/projectsarchive', '/projects')).toBe(false)
        expect(isNavHrefActive('/work-items', '/work')).toBe(false)
    })
})

describe('activeNavItemId', () => {
    it('names the area a path belongs to', () => {
        expect(activeNavItemId('/')).toBe('office')
        expect(activeNavItemId('/channels/general')).toBe('channels')
        expect(activeNavItemId('/review')).toBe('review')
    })

    it('names none outside the areas', () => {
        expect(activeNavItemId('/settings')).toBeNull()
    })
})
