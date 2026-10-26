import { cache } from "react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { ModuleKey } from "@/lib/modules";
import { evaluateLicense, type LicenseState } from "@/lib/license-core";

export { parseLicense, evaluateLicense } from "@/lib/license-core";
export type { LicensePayload, LicenseState } from "@/lib/license-core";

export const getLicenseState = cache(async (): Promise<LicenseState> => {
  const settings = await prisma.clinicSettings.findUnique({ where: { id: "default" }, select: { licenseKey: true } });
  return evaluateLicense(settings?.licenseKey);
});

export async function isModuleEnabled(key: ModuleKey) {
  return (await getLicenseState()).modules.includes(key);
}

// For pages and server actions owned by a module
export async function requireModule(key: ModuleKey) {
  if (!(await isModuleEnabled(key))) notFound();
}

// For server actions: refuse to run when the owning module is disabled
export async function assertModule(key: ModuleKey) {
  if (!(await isModuleEnabled(key))) throw new Error(`Module "${key}" is not enabled for this clinic`);
}
