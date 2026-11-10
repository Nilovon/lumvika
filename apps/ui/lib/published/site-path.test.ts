import { describe, expect, it } from 'vitest'
import { resolveSitePath } from './site-path'

const FILES = ['index.html', 'about.html', 'docs/index.html', 'img/cover.png', 'app.js']

describe('resolveSitePath', () => {
    it('serves index.html at the root', () => {
        expect(resolveSitePath([], FILES)).toBe(0)
    })

    it('resolves exact files, extensionless pages and folder indexes', () => {
        expect(resolveSitePath(['img', 'cover.png'], FILES)).toBe(3)
        expect(resolveSitePath(['about'], FILES)).toBe(1)
        expect(resolveSitePath(['docs'], FILES)).toBe(2)
    })

    it('answers null for anything outside the manifest', () => {
        expect(resolveSitePath(['missing.css'], FILES)).toBeNull()
        expect(resolveSitePath(['..', 'index.html'], FILES)).toBeNull()
        expect(resolveSitePath(['img', '..', 'app.js'], FILES)).toBeNull()
    })
})
