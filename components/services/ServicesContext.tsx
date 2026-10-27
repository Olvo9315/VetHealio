"use client";

import { createContext, useContext } from "react";

export type DataLocale = "es" | "ru" | "en";

export const LANGUAGE_NAMES: Record<DataLocale, string> = { es: "Español", ru: "Русский", en: "English" };

// Clinic data language (official service names) and whether the viewer may edit the catalog
const ServicesContext = createContext<{ dataLocale: DataLocale; canManage: boolean }>({
  dataLocale: "es",
  canManage: false,
});

export const ServicesProvider = ServicesContext.Provider;

export function useServicesContext() {
  return useContext(ServicesContext);
}
