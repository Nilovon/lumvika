import { loadMessages } from '@lumvika/i18n/messages'
import { localeNativeName, matchLocale, parseAcceptLanguage, resolveLocale } from '@lumvika/i18n'
import { formatBytes, formatDuration, formatList, longDate, messageDayLabel, shortDate, shortRelativeTime, shortUntil, weekdayNames } from '@lumvika/i18n/format'
import { pseudoLocalize } from '@lumvika/i18n/pseudo'
import { mergeMessages } from '@lumvika/i18n'
import { describe, expect, it } from 'vitest'

const NOW = new Date('2026-11-09T12:00:00Z')
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString()
const ahead = (ms: number) => new Date(NOW.getTime() + ms).toISOString()
// ICU separates a number from its unit with a (narrow) no-break space.
const plain = (text: string) => text.replace(/[\u00a0\u202f]/g, ' ')
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

describe('resolveLocale', () => {
    it('takes the account first, then the cookie, then the browser', () => {
        expect(resolveLocale({ userLocale: 'de', cookie: 'en', acceptLanguage: 'en' })).toBe('de')
        expect(resolveLocale({ userLocale: null, cookie: 'de', acceptLanguage: 'en' })).toBe('de')
        expect(resolveLocale({ acceptLanguage: 'it-IT,en;q=0.8,de;q=0.9' })).toBe('de')
        expect(resolveLocale({ acceptLanguage: 'it-IT' })).toBe('en')
        expect(resolveLocale({})).toBe('en')
    })

    it('ignores what it does not ship', () => {
        expect(resolveLocale({ userLocale: 'it', cookie: 'xx', acceptLanguage: 'de-AT' })).toBe('de')
        expect(matchLocale('DE-at')).toBe('de')
        expect(matchLocale('de-CH')).toBe('de')
        expect(parseAcceptLanguage('*, de;q=0')).toBeNull()
    })

    it('falls back for a language whose pack was removed, wherever it is still stored', () => {
        expect(matchLocale('fr')).toBeNull()
        expect(resolveLocale({ userLocale: 'fr' })).toBe('en')
        expect(resolveLocale({ userLocale: 'fr', cookie: 'es', acceptLanguage: 'pt-BR,de;q=0.5' })).toBe('de')
    })

    it('names each language in its own words', () => {
        expect(localeNativeName('de')).toBe('Deutsch')
        expect(localeNativeName('en')).toBe('English')
    })
})

describe('format', () => {
    it('keeps the English output it had before the packs', () => {
        expect(shortRelativeTime(ago(30_000), 'en', NOW)).toBe('now')
        expect(shortRelativeTime(ago(5 * MINUTE), 'en', NOW)).toBe('5m')
        expect(shortRelativeTime(ago(3 * HOUR), 'en', NOW)).toBe('3h')
        expect(shortRelativeTime(ago(2 * DAY), 'en', NOW)).toBe('2d')
        expect(shortUntil(ahead(5 * MINUTE + 1000), 'en', NOW)).toBe('in 5m')
        expect(shortDate('2026-03-05T12:00:00Z', 'en')).toBe('Mar 5')
        expect(longDate('2026-03-05T12:00:00Z', 'en')).toBe('Mar 5, 2026')
        expect(formatBytes(1536, 'en')).toBe('1.5 KB')
        expect(formatDuration(125 * MINUTE, 'en')).toBe('2h 5m')
        expect(weekdayNames('en')).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
    })

    it('speaks German', () => {
        expect(shortRelativeTime(ago(30_000), 'de', NOW)).toBe('jetzt')
        expect(plain(shortRelativeTime(ago(2 * DAY), 'de', NOW))).toBe('2 T')
        expect(plain(shortUntil(ahead(3 * HOUR + 1000), 'de', NOW))).toBe('in 3 Std.')
        expect(shortDate('2026-03-05T12:00:00Z', 'de')).toBe('5. März')
        expect(plain(formatBytes(1536, 'de'))).toBe('1,5 kB')
    })

    it('joins a list the way each language does', () => {
        expect(formatList(['Todo', 'Blocked', 'Cancelled'], 'en', 'disjunction')).toBe('Todo, Blocked, or Cancelled')
        expect(formatList(['Todo', 'Blocked'], 'en')).toBe('Todo and Blocked')
        expect(formatList(['Zu erledigen', 'Blockiert', 'Abgebrochen'], 'de', 'disjunction')).toBe('Zu erledigen, Blockiert oder Abgebrochen')
    })

    it('labels the days of a conversation', () => {
        const today = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate(), 10).toISOString()
        const yesterday = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - 1, 10).toISOString()
        expect(messageDayLabel(today, 'en', NOW)).toBe('Today')
        expect(messageDayLabel(yesterday, 'en', NOW)).toBe('Yesterday')
        expect(messageDayLabel(today, 'de', NOW)).toBe('Heute')
        expect(messageDayLabel(yesterday, 'de', NOW)).toBe('Gestern')
    })
})

describe('pseudoLocalize', () => {
    it('stretches the words and leaves the ICU syntax and the tags alone', () => {
        expect(pseudoLocalize('{count, plural, one {# file} other {# files}} in <b>{name}</b>')).toBe('[{count, plural, one {# ƒíļé} other {# ƒíļéš}} íñ <b>{name}</b> ~~~~]')
    })
})

describe('messages', () => {
    it('falls back to English for a key a pack lacks', () => {
        expect(mergeMessages({ a: 'A', b: { c: 'C', d: 'D' } }, { b: { c: 'C de' } })).toEqual({ a: 'A', b: { c: 'C de', d: 'D' } })
    })

    it('loads the packs without the translator notes', async () => {
        const german = await loadMessages('de')
        expect(german.account.title).toBe('Konto')
        expect('_context' in german.account).toBe(false)
        expect((await loadMessages('en-XA')).common.save).toBe('[Šáṽé ~~]')
    })
})
