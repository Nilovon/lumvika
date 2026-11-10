import { describe, expect, it } from 'vitest'
import { parseFrontmatter } from './frontmatter.js'

describe('parseFrontmatter', () => {
    it('parses valid yaml frontmatter', () => {
        const { data, body } = parseFrontmatter('---\nname: viral-hooks\ndescription: Write the opening line\n---\n\n# Body\n')
        expect(data.name).toBe('viral-hooks')
        expect(data.description).toBe('Write the opening line')
        expect(body.trim()).toBe('# Body')
    })

    it('accepts an unquoted description containing a colon', () => {
        const content = '---\nname: viral-post\ndescription: Write the full X post from a settled angle and hook: body, proof, payoff, close, and the first comment. Use when a post reads flat.\n---\n\n# viral-post\n'
        const { data, body } = parseFrontmatter(content)
        expect(data.name).toBe('viral-post')
        expect(data.description).toBe('Write the full X post from a settled angle and hook: body, proof, payoff, close, and the first comment. Use when a post reads flat.')
        expect(body.trim()).toBe('# viral-post')
    })

    it('keeps quoted values unwrapped and folds continuation lines', () => {
        const { data } = parseFrontmatter('---\nname: "quoted: name"\ndescription: first part: broken\n  second part\n---\nBody\n')
        expect(data.name).toBe('quoted: name')
        expect(data.description).toBe('first part: broken second part')
    })

    it('returns empty data when there is no frontmatter', () => {
        const { data, body } = parseFrontmatter('# Just a body\n')
        expect(data).toEqual({})
        expect(body.trim()).toBe('# Just a body')
    })
})
