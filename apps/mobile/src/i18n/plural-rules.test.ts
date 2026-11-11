import { installPluralRules, PackPluralRules } from '@/i18n/plural-rules'

describe('PackPluralRules', () => {
    it('follows the CLDR cardinal rules of the packs', () => {
        expect([0, 1, 2].map(n => new PackPluralRules('en').select(n))).toEqual(['other', 'one', 'other'])
        expect([0, 1, 1.5, 2, 1_000_000].map(n => new PackPluralRules('de-AT').select(n))).toEqual(['other', 'one', 'other', 'other', 'other'])
    })

    it('stands in for a missing Intl.PluralRules, and only then', () => {
        const bare: { PluralRules?: unknown } = {}
        installPluralRules(bare)
        expect(bare.PluralRules).toBe(PackPluralRules)

        const native = { PluralRules: Intl.PluralRules }
        installPluralRules(native)
        expect(native.PluralRules).toBe(Intl.PluralRules)
    })

    it('lets a plural message format where Hermes has no Intl.PluralRules', () => {
        const { createTranslator } = jest.requireActual<typeof import('use-intl')>('use-intl')
        const native = Intl.PluralRules
        try {
            Reflect.deleteProperty(Intl, 'PluralRules')
            installPluralRules()
            const t = createTranslator({ locale: 'de', messages: { files: '{count, plural, one {# Datei} other {# Dateien}}' } })
            expect(t('files', { count: 0 })).toBe('0 Dateien')
            expect(t('files', { count: 3 })).toBe('3 Dateien')
        } finally {
            Object.defineProperty(Intl, 'PluralRules', { value: native, configurable: true, writable: true })
        }
    })
})
