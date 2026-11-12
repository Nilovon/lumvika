import { describe, expect, it } from 'vitest'

import { parseSidebarCollapsed } from './sidebar-state'

describe('parseSidebarCollapsed', () => {
    it('reads the two values the cookie is written with', () => {
        expect(parseSidebarCollapsed('collapsed')).toBe(true)
        expect(parseSidebarCollapsed('expanded')).toBe(false)
    })

    it('knows nothing from a missing or foreign value', () => {
        expect(parseSidebarCollapsed(undefined)).toBeNull()
        expect(parseSidebarCollapsed(null)).toBeNull()
        expect(parseSidebarCollapsed('')).toBeNull()
        expect(parseSidebarCollapsed('true')).toBeNull()
    })
})
