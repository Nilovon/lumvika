import { DEFAULT_LOCALE, mergeMessages, type Locale } from '@lumvika/i18n'

import enChatErrors from '@lumvika/i18n/messages/en/chatErrors.json'
import enMobileAuth from '@lumvika/i18n/messages/en/mobileAuth.json'
import enMobileCards from '@lumvika/i18n/messages/en/mobileCards.json'
import enMobileChat from '@lumvika/i18n/messages/en/mobileChat.json'
import enMobileCommon from '@lumvika/i18n/messages/en/mobileCommon.json'
import enMobileCoworker from '@lumvika/i18n/messages/en/mobileCoworker.json'
import enMobileHitl from '@lumvika/i18n/messages/en/mobileHitl.json'
import enMobileHome from '@lumvika/i18n/messages/en/mobileHome.json'
import enMobileOnboarding from '@lumvika/i18n/messages/en/mobileOnboarding.json'
import enMobileProviders from '@lumvika/i18n/messages/en/mobileProviders.json'
import enMobileSettings from '@lumvika/i18n/messages/en/mobileSettings.json'
import enMobileSteps from '@lumvika/i18n/messages/en/mobileSteps.json'
import enSubRuns from '@lumvika/i18n/messages/en/subRuns.json'
import enTools from '@lumvika/i18n/messages/en/tools.json'
import deChatErrors from '@lumvika/i18n/messages/de/chatErrors.json'
import deMobileAuth from '@lumvika/i18n/messages/de/mobileAuth.json'
import deMobileCards from '@lumvika/i18n/messages/de/mobileCards.json'
import deMobileChat from '@lumvika/i18n/messages/de/mobileChat.json'
import deMobileCommon from '@lumvika/i18n/messages/de/mobileCommon.json'
import deMobileCoworker from '@lumvika/i18n/messages/de/mobileCoworker.json'
import deMobileHitl from '@lumvika/i18n/messages/de/mobileHitl.json'
import deMobileHome from '@lumvika/i18n/messages/de/mobileHome.json'
import deMobileOnboarding from '@lumvika/i18n/messages/de/mobileOnboarding.json'
import deMobileProviders from '@lumvika/i18n/messages/de/mobileProviders.json'
import deMobileSettings from '@lumvika/i18n/messages/de/mobileSettings.json'
import deMobileSteps from '@lumvika/i18n/messages/de/mobileSteps.json'
import deSubRuns from '@lumvika/i18n/messages/de/subRuns.json'
import deTools from '@lumvika/i18n/messages/de/tools.json'

// Only the app's own namespaces ship in the bundle: the web's strings would weigh on every launch.
const english = { chatErrors: enChatErrors, mobileAuth: enMobileAuth, mobileCards: enMobileCards, mobileChat: enMobileChat, mobileCommon: enMobileCommon, mobileCoworker: enMobileCoworker, mobileHitl: enMobileHitl, mobileHome: enMobileHome, mobileOnboarding: enMobileOnboarding, mobileProviders: enMobileProviders, mobileSettings: enMobileSettings, mobileSteps: enMobileSteps, subRuns: enSubRuns, tools: enTools }
const german = { chatErrors: deChatErrors, mobileAuth: deMobileAuth, mobileCards: deMobileCards, mobileChat: deMobileChat, mobileCommon: deMobileCommon, mobileCoworker: deMobileCoworker, mobileHitl: deMobileHitl, mobileHome: deMobileHome, mobileOnboarding: deMobileOnboarding, mobileProviders: deMobileProviders, mobileSettings: deMobileSettings, mobileSteps: deMobileSteps, subRuns: deSubRuns, tools: deTools }

export type MobileMessages = typeof english

const PACKS: Record<Locale, Partial<Record<keyof MobileMessages, object>>> = { en: english, de: german }

const merged = new Map<Locale, MobileMessages>()

// The English source under the pack, so a key the pack lacks still reads in English.
export function messagesFor(locale: Locale): MobileMessages {
    if (locale === DEFAULT_LOCALE) return english
    let messages = merged.get(locale)
    if (!messages) {
        messages = mergeMessages(english, PACKS[locale] as Record<string, never>)
        merged.set(locale, messages)
    }
    return messages
}
