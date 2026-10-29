import { getTranslations } from "next-intl/server";

// Printed documents (home-care sheet, invoices, consent) are rendered in a language of their own:
// the one asked for in ?lang=, else the clinic's data language, independent of the UI language.
export type DocLocale = "es" | "ru" | "en";
export const DOC_LOCALES: DocLocale[] = ["es", "ru", "en"];

export function docLocale(lang: string | undefined, fallback: DocLocale): DocLocale {
  return DOC_LOCALES.includes(lang as DocLocale) ? (lang as DocLocale) : fallback;
}

export function getDocT(locale: DocLocale) {
  return getTranslations({ locale, namespace: "documents" });
}

const dateFormats: Record<DocLocale, string> = { es: "es-ES", ru: "ru-RU", en: "en-GB" };

export function docDate(d: Date | string, locale: DocLocale, withTime = false) {
  return new Intl.DateTimeFormat(dateFormats[locale], {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    timeZone: "Europe/Madrid",
  }).format(new Date(d));
}

// wa.me needs the number with country code and digits only; Spanish numbers are stored without it
export function whatsappNumber(phone: string) {
  const digits = phone.replace(/\D/g, "").replace(/^00/, "");
  return digits.length === 9 && /^[6789]/.test(digits) ? `34${digits}` : digits;
}
