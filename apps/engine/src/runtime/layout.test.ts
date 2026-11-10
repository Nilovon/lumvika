import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { detectLayout } from './layout.js'

const roots: string[] = []

function scratch(): string {
    const dir = realpathSync(mkdtempSync(resolve(tmpdir(), 'lumvika-layout-')))
    roots.push(dir)
    return dir
}

function touch(path: string, content = ''): string {
    mkdirSync(resolve(path, '..'), { recursive: true })
    writeFileSync(path, content)
    return path
}

afterEach(() => {
    for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('detectLayout', () => {
    it('sees a release under releases/<commit>/ with its build-info', () => {
        const root = scratch()
        const release = resolve(root, 'releases', 'abc1234')
        touch(resolve(release, 'build-info.json'), '{"commit":"abc1234"}')
        const module = touch(resolve(release, 'dist', 'runtime', 'layout.js'))
        expect(detectLayout(module)).toEqual({ kind: 'release', root, packageDir: release })
    })

    it('resolves the running release through the current link', () => {
        const root = scratch()
        const release = resolve(root, 'releases', 'abc1234')
        touch(resolve(release, 'build-info.json'), '{"commit":"abc1234"}')
        touch(resolve(release, 'dist', 'runtime', 'layout.js'))
        symlinkSync('releases/abc1234', resolve(root, 'current'))
        expect(detectLayout(resolve(root, 'current', 'dist', 'runtime', 'layout.js'))).toMatchObject({ kind: 'release', packageDir: release })
    })

    it('sees a checkout by its pnpm-workspace.yaml, even with a release folder name above', () => {
        const root = scratch()
        touch(resolve(root, 'pnpm-workspace.yaml'))
        const module = touch(resolve(root, 'apps', 'engine', 'src', 'runtime', 'layout.ts'))
        expect(detectLayout(module)).toEqual({ kind: 'monorepo', root, packageDir: resolve(root, 'apps', 'engine') })
    })

    it('treats a release folder without build-info as part of the checkout around it', () => {
        const root = scratch()
        touch(resolve(root, 'pnpm-workspace.yaml'))
        const module = touch(resolve(root, 'releases', 'abc1234', 'dist', 'runtime', 'layout.js'))
        expect(detectLayout(module)).toEqual({ kind: 'monorepo', root, packageDir: resolve(root, 'releases', 'abc1234') })
    })

    it('falls back to an image: the package folder above dist/, nothing else', () => {
        const root = scratch()
        const module = touch(resolve(root, 'app', 'dist', 'cli', 'bin.js'))
        expect(detectLayout(module)).toEqual({ kind: 'image', root: resolve(root, 'app'), packageDir: resolve(root, 'app') })
    })

    it('reports itself as a checkout when run from the repository', () => {
        expect(detectLayout().kind).toBe('monorepo')
    })
})
