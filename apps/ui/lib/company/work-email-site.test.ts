import { describe, expect, it } from 'vitest'

import { workEmailSite } from './work-email-site'

describe('workEmailSite', () => {
    it('reads the company site from a work address', () => {
        expect(workEmailSite('wenyue@springbrand.ai')).toBe('https://springbrand.ai')
        expect(workEmailSite('Salman@BasisVPS.com')).toBe('https://basisvps.com')
    })

    it('gives nothing for a personal mailbox, whatever its country', () => {
        for (const email of ['a@gmail.com', 'a@icloud.com', 'a@yahoo.fr', 'a@hotmail.co.uk', 'a@outlook.com', 'a@gmx.de', 'a@orange.fr', 'a@protonmail.com']) {
            expect(workEmailSite(email)).toBeNull()
        }
    })

    it('gives nothing without an address', () => {
        expect(workEmailSite(null)).toBeNull()
        expect(workEmailSite('not-an-email')).toBeNull()
    })
})
