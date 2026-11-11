import { DEFAULT_LOCALE, mergeMessages, type Locale } from "@lumvika/i18n";
import german from "@lumvika/i18n/messages/de/emails.json";
import english from "@lumvika/i18n/messages/en/emails.json";
import { createTranslator } from "use-intl/core";

export type { Locale as EmailLocale };

const PACKS: Record<Locale, typeof english | Partial<typeof english>> = {
  en: english,
  de: german,
};

// Built synchronously: an email is rendered once, outside any request, by code that already knows
// its reader. Merging over an empty base drops the translator notes (`_context`) of the source, and
// a key missing from a pack reads in English.
export function emailTranslator(locale: Locale = DEFAULT_LOCALE) {
  const emails = mergeMessages({} as typeof english, english, locale === DEFAULT_LOCALE ? undefined : PACKS[locale]);
  return createTranslator({ locale, messages: { emails }, namespace: "emails" });
}

export type EmailTranslator = ReturnType<typeof emailTranslator>;
