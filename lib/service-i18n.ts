import { getTranslations } from "next-intl/server";

type Named = { name: string; i18nKey?: string | null };

// Built-in catalog services carry an i18nKey; their names are shown in the UI language.
// Services created or renamed by the clinic keep their own name.
export async function getServiceLocalizer() {
  const t = await getTranslations("serviceCatalog");
  return function localize<T extends Named>(service: T): T {
    return service.i18nKey && t.has(service.i18nKey) ? { ...service, name: t(service.i18nKey) } : service;
  };
}

// Same, for a record that has an optional `service` relation (appointments, invoice items)
export async function getServiceRelationLocalizer() {
  const localize = await getServiceLocalizer();
  return function withLocalizedService<T extends { service?: Named | null }>(record: T): T {
    return record.service ? { ...record, service: localize(record.service) } : record;
  };
}
