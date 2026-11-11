import { initialSymbolOf, logoUrlOf, workspaceInitials } from '@/components/home/workspace-logos'

jest.mock('expo-file-system', () => ({ Directory: class {}, File: class {}, Paths: {} }))

describe('workspaceInitials', () => {
    it('takes the first letters of the first two words, and the default label when there is no name', () => {
        expect(workspaceInitials({ name: 'acme growth team' })).toBe('AG')
        expect(workspaceInitials({ name: 'Zeta' })).toBe('Z')
        expect(workspaceInitials({ name: '  ' })).toBe('MW')
    })

    it('keeps an emoji whole', () => {
        expect(workspaceInitials({ name: '🚀 Launch' })).toBe('🚀L')
    })
})

describe('logoUrlOf', () => {
    it('keeps only a full web address', () => {
        expect(logoUrlOf('https://storage.example.com/workspace-logos/1.png')).toBe('https://storage.example.com/workspace-logos/1.png')
        expect(logoUrlOf('/pricing/scale.png')).toBeNull()
        expect(logoUrlOf('')).toBeNull()
        expect(logoUrlOf(null)).toBeNull()
    })
})

describe('initialSymbolOf', () => {
    it('picks the lettered symbol of the first initial, and a building when it is not a letter', () => {
        expect(initialSymbolOf({ name: 'Acme' })).toBe('a.circle.fill')
        expect(initialSymbolOf({ name: '🚀 Launch' })).toBe('building.2')
    })
})
