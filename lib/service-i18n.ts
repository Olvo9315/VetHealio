import { getLocale } from "next-intl/server";
import type { Prisma } from "@prisma/client";

export type ServiceTranslations = Partial<Record<"es" | "ru" | "en", string>>;

type Named = { name: string; translations?: Prisma.JsonValue | null };
export type Localized<T> = T & { officialName: string; translations: ServiceTranslations };

export function readTranslations(value: Prisma.JsonValue | null | undefined): ServiceTranslations {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => typeof v === "string" && v.trim() !== "")
  ) as ServiceTranslations;
}

// `name` becomes the display name in the viewer's UI language (translation if set);
// `officialName` keeps the stored name in the clinic language for invoices and documents.
export async function getServiceLocalizer() {
  const locale = (await getLocale()) as keyof ServiceTranslations;
  return function localize<T extends Named>(service: T): Localized<T> {
    const translations = readTranslations(service.translations);
    return { ...service, translations, officialName: service.name, name: translations[locale] || service.name };
  };
}

// Same, for a record that has an optional `service` relation (appointments, invoice items)
export async function getServiceRelationLocalizer() {
  const localize = await getServiceLocalizer();
  return function withLocalizedService<T extends { service?: Named | null }>(record: T): T {
    return record.service ? { ...record, service: localize(record.service) } : record;
  };
}
