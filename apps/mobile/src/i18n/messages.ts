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
import frChatErrors from '@lumvika/i18n/messages/fr/chatErrors.json'
import frMobileAuth from '@lumvika/i18n/messages/fr/mobileAuth.json'
import frMobileCards from '@lumvika/i18n/messages/fr/mobileCards.json'
import frMobileChat from '@lumvika/i18n/messages/fr/mobileChat.json'
import frMobileCommon from '@lumvika/i18n/messages/fr/mobileCommon.json'
import frMobileCoworker from '@lumvika/i18n/messages/fr/mobileCoworker.json'
import frMobileHitl from '@lumvika/i18n/messages/fr/mobileHitl.json'
import frMobileHome from '@lumvika/i18n/messages/fr/mobileHome.json'
import frMobileOnboarding from '@lumvika/i18n/messages/fr/mobileOnboarding.json'
import frMobileProviders from '@lumvika/i18n/messages/fr/mobileProviders.json'
import frMobileSettings from '@lumvika/i18n/messages/fr/mobileSettings.json'
import frMobileSteps from '@lumvika/i18n/messages/fr/mobileSteps.json'
import frSubRuns from '@lumvika/i18n/messages/fr/subRuns.json'
import frTools from '@lumvika/i18n/messages/fr/tools.json'
import esChatErrors from '@lumvika/i18n/messages/es/chatErrors.json'
import esMobileAuth from '@lumvika/i18n/messages/es/mobileAuth.json'
import esMobileCards from '@lumvika/i18n/messages/es/mobileCards.json'
import esMobileChat from '@lumvika/i18n/messages/es/mobileChat.json'
import esMobileCommon from '@lumvika/i18n/messages/es/mobileCommon.json'
import esMobileCoworker from '@lumvika/i18n/messages/es/mobileCoworker.json'
import esMobileHitl from '@lumvika/i18n/messages/es/mobileHitl.json'
import esMobileHome from '@lumvika/i18n/messages/es/mobileHome.json'
import esMobileOnboarding from '@lumvika/i18n/messages/es/mobileOnboarding.json'
import esMobileProviders from '@lumvika/i18n/messages/es/mobileProviders.json'
import esMobileSettings from '@lumvika/i18n/messages/es/mobileSettings.json'
import esMobileSteps from '@lumvika/i18n/messages/es/mobileSteps.json'
import esSubRuns from '@lumvika/i18n/messages/es/subRuns.json'
import esTools from '@lumvika/i18n/messages/es/tools.json'
import ptChatErrors from '@lumvika/i18n/messages/pt/chatErrors.json'
import ptMobileAuth from '@lumvika/i18n/messages/pt/mobileAuth.json'
import ptMobileCards from '@lumvika/i18n/messages/pt/mobileCards.json'
import ptMobileChat from '@lumvika/i18n/messages/pt/mobileChat.json'
import ptMobileCommon from '@lumvika/i18n/messages/pt/mobileCommon.json'
import ptMobileCoworker from '@lumvika/i18n/messages/pt/mobileCoworker.json'
import ptMobileHitl from '@lumvika/i18n/messages/pt/mobileHitl.json'
import ptMobileHome from '@lumvika/i18n/messages/pt/mobileHome.json'
import ptMobileOnboarding from '@lumvika/i18n/messages/pt/mobileOnboarding.json'
import ptMobileProviders from '@lumvika/i18n/messages/pt/mobileProviders.json'
import ptMobileSettings from '@lumvika/i18n/messages/pt/mobileSettings.json'
import ptMobileSteps from '@lumvika/i18n/messages/pt/mobileSteps.json'
import ptSubRuns from '@lumvika/i18n/messages/pt/subRuns.json'
import ptTools from '@lumvika/i18n/messages/pt/tools.json'
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
const french = { chatErrors: frChatErrors, mobileAuth: frMobileAuth, mobileCards: frMobileCards, mobileChat: frMobileChat, mobileCommon: frMobileCommon, mobileCoworker: frMobileCoworker, mobileHitl: frMobileHitl, mobileHome: frMobileHome, mobileOnboarding: frMobileOnboarding, mobileProviders: frMobileProviders, mobileSettings: frMobileSettings, mobileSteps: frMobileSteps, subRuns: frSubRuns, tools: frTools }
const spanish = { chatErrors: esChatErrors, mobileAuth: esMobileAuth, mobileCards: esMobileCards, mobileChat: esMobileChat, mobileCommon: esMobileCommon, mobileCoworker: esMobileCoworker, mobileHitl: esMobileHitl, mobileHome: esMobileHome, mobileOnboarding: esMobileOnboarding, mobileProviders: esMobileProviders, mobileSettings: esMobileSettings, mobileSteps: esMobileSteps, subRuns: esSubRuns, tools: esTools }
const portuguese = { chatErrors: ptChatErrors, mobileAuth: ptMobileAuth, mobileCards: ptMobileCards, mobileChat: ptMobileChat, mobileCommon: ptMobileCommon, mobileCoworker: ptMobileCoworker, mobileHitl: ptMobileHitl, mobileHome: ptMobileHome, mobileOnboarding: ptMobileOnboarding, mobileProviders: ptMobileProviders, mobileSettings: ptMobileSettings, mobileSteps: ptMobileSteps, subRuns: ptSubRuns, tools: ptTools }
const german = { chatErrors: deChatErrors, mobileAuth: deMobileAuth, mobileCards: deMobileCards, mobileChat: deMobileChat, mobileCommon: deMobileCommon, mobileCoworker: deMobileCoworker, mobileHitl: deMobileHitl, mobileHome: deMobileHome, mobileOnboarding: deMobileOnboarding, mobileProviders: deMobileProviders, mobileSettings: deMobileSettings, mobileSteps: deMobileSteps, subRuns: deSubRuns, tools: deTools }

export type MobileMessages = typeof english

const PACKS: Record<Locale, Partial<Record<keyof MobileMessages, object>>> = { en: english, fr: french, es: spanish, pt: portuguese, de: german }

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
