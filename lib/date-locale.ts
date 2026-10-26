import { es, ru, enGB, type Locale } from "date-fns/locale";
import { useLocale } from "next-intl";

const DATE_LOCALES: Record<string, Locale> = { es, ru, en: enGB };
const INTL_LOCALES: Record<string, string> = { es: "es-ES", ru: "ru-RU", en: "en-GB" };

// date-fns locale for the UI language
export function getDateLocale(locale: string): Locale {
  return DATE_LOCALES[locale] ?? es;
}

// BCP 47 tag for Intl / toLocaleString in the UI language
export function getIntlLocale(locale: string): string {
  return INTL_LOCALES[locale] ?? "es-ES";
}

export function useDateLocale() {
  return getDateLocale(useLocale());
}

export function useIntlLocale() {
  return getIntlLocale(useLocale());
}
