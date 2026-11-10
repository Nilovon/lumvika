import { describe, expect, it } from 'vitest'

import { MAX_SKILL_FILE_BYTES, MAX_SKILL_REFERENCE_FILES, readSkillFolders } from './folder-import'

function fakeFile(path: string, content: string): File {
    const file = new File([content], path.split('/').pop()!, { type: 'text/markdown' })
    Object.defineProperty(file, 'webkitRelativePath', { value: path })
    return file
}

function fakeSizedFile(path: string, size: number, content = 'x'): File {
    const file = fakeFile(path, content)
    Object.defineProperty(file, 'size', { value: size })
    return file
}

const skillMarkdown = '---\nname: viral-post\ndescription: hook: body\n---\n\nFill the slots\n'

describe('readSkillFolders', () => {
    it('reads a single skill folder with its references', async () => {
        const [skill, ...rest] = await readSkillFolders([
            fakeFile('viral-post/SKILL.md', skillMarkdown),
            fakeFile('viral-post/references/structure.md', '# Structure'),
            fakeFile('viral-post/.DS_Store', 'junk'),
        ])
        expect(rest).toHaveLength(0)
        expect(skill!.name).toBe('viral-post')
        expect(skill!.content).toBe(skillMarkdown)
        expect(skill!.files).toEqual([{ path: 'references/structure.md', content: '# Structure' }])
    })

    it('reads every skill of a package folder and ignores what sits outside them', async () => {
        const skills = await readSkillFolders([
            fakeFile('viral-content-skills/README.md', '# Package'),
            fakeFile('viral-content-skills/viral-post/SKILL.md', skillMarkdown),
            fakeFile('viral-content-skills/viral-post/references/structure.md', '# Structure'),
            fakeFile('viral-content-skills/viral-hooks/SKILL.md', skillMarkdown),
        ])
        expect(skills.map(skill => skill.name)).toEqual(['viral-post', 'viral-hooks'])
        expect(skills[0]!.files.map(file => file.path)).toEqual(['references/structure.md'])
        expect(skills[1]!.files).toEqual([])
    })

    it('reports binary files as skipped', async () => {
        const [skill] = await readSkillFolders([fakeFile('viral-post/SKILL.md', skillMarkdown), fakeFile('viral-post/references/cover.png', 'binary')])
        expect(skill!.files).toEqual([])
        expect(skill!.skipped).toEqual(['references/cover.png'])
    })

    it('throws when no SKILL.md is present', async () => {
        await expect(readSkillFolders([fakeFile('notes/todo.md', '# Todo')])).rejects.toThrow('No SKILL.md found in this folder')
    })

    it('accepts a 10 MB reference and rejects anything larger', async () => {
        const accepted = await readSkillFolders([
            fakeSizedFile('large/SKILL.md', 1, skillMarkdown),
            fakeSizedFile('large/references/corpus.txt', MAX_SKILL_FILE_BYTES),
        ])
        expect(accepted[0]!.files).toEqual([{ path: 'references/corpus.txt', content: 'x' }])

        await expect(
            readSkillFolders([
                fakeSizedFile('too-large/SKILL.md', 1, skillMarkdown),
                fakeSizedFile('too-large/references/corpus.txt', MAX_SKILL_FILE_BYTES + 1),
            ]),
        ).rejects.toThrow('max 10 MB per file')
    })

    it('counts SKILL.md in the 50 MB folder limit', async () => {
        const exact = [
            fakeSizedFile('full/SKILL.md', 1, skillMarkdown),
            ...Array.from({ length: 4 }, (_, i) => fakeSizedFile(`full/references/${i}.txt`, MAX_SKILL_FILE_BYTES)),
            fakeSizedFile('full/references/last.txt', MAX_SKILL_FILE_BYTES - 1),
        ]
        expect(await readSkillFolders(exact)).toHaveLength(1)

        exact[exact.length - 1] = fakeSizedFile('full/references/last.txt', MAX_SKILL_FILE_BYTES)
        await expect(readSkillFolders(exact)).rejects.toThrow('max 50 MB per skill')
    })

    it('refuses more than 200 text references', async () => {
        const files = Array.from({ length: MAX_SKILL_REFERENCE_FILES + 1 }, (_, i) => fakeFile(`crowded/references/${i}.txt`, 'x'))
        await expect(readSkillFolders([fakeFile('crowded/SKILL.md', skillMarkdown), ...files])).rejects.toThrow('too many reference files')
    })
})
