"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Role } from "@prisma/client";
import { parseLicense } from "@/lib/license";
import { readTranslations } from "@/lib/service-i18n";

const optional = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));

const clinicSchema = z.object({
  name: z.string().trim().min(1).max(100),
  legalName: optional(150),
  nif: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{8,10}$/, "invalidNif")
    .optional()
    .or(z.literal("")),
  registrationNumber: optional(50),
  address: optional(200),
  postalCode: optional(10),
  city: optional(100),
  province: optional(100),
  country: z.string().trim().min(1).max(100),
  phone: optional(30),
  email: z.string().trim().email("invalidEmail").optional().or(z.literal("")),
  website: optional(200),
  iban: z
    .string()
    .trim()
    .toUpperCase()
    .transform((v) => v.replace(/\s+/g, ""))
    .refine((v) => v === "" || /^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$/.test(v), "invalidIban")
    .optional(),
  defaultTaxRate: z.coerce.number().min(0).max(100),
  dataLocale: z.enum(["es", "ru", "en"]),
  invoiceFooter: optional(500),
});

export type ClinicFormData = z.input<typeof clinicSchema>;

async function requireAdmin() {
  const session = await auth();
  const user = session?.user as { role?: Role } | undefined;
  if (user?.role !== "ADMIN") throw new Error("Forbidden");
}

export async function updateClinicSettings(data: ClinicFormData) {
  await requireAdmin();
  const parsed = clinicSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.flatten() };

  const { name, country, defaultTaxRate, dataLocale, ...rest } = parsed.data;
  const nullable = Object.fromEntries(
    Object.entries(rest).map(([k, v]) => [k, v ? v : null])
  );

  const previous = await prisma.clinicSettings.findUnique({ where: { id: "default" }, select: { dataLocale: true } });
  await prisma.clinicSettings.upsert({
    where: { id: "default" },
    create: { id: "default", name, country, defaultTaxRate, dataLocale, ...nullable },
    update: { name, country, defaultTaxRate, dataLocale, ...nullable },
  });
  if (previous && previous.dataLocale !== dataLocale) {
    await switchServiceLanguage(previous.dataLocale, dataLocale);
  }

  revalidatePath("/", "layout");
  return { success: true };
}

// Applies a license key pasted by the clinic admin (e.g. on-prem installs); empty clears it
export async function updateLicenseKey(key: string) {
  await requireAdmin();
  const trimmed = key.trim();
  if (trimmed && !parseLicense(trimmed)) return { error: "invalidLicense" };
  await prisma.clinicSettings.upsert({
    where: { id: "default" },
    create: { id: "default", licenseKey: trimmed || null },
    update: { licenseKey: trimmed || null },
  });
  revalidatePath("/", "layout");
  return { success: true };
}

// When the clinic's data language changes, a service whose translation exists in the new
// language gets it as its official name, and the old official name becomes a translation.
// Services without that translation keep their current name.
async function switchServiceLanguage(from: string, to: string) {
  const services = await prisma.service.findMany({ select: { id: true, name: true, translations: true } });
  for (const s of services) {
    const translations = readTranslations(s.translations) as Record<string, string>;
    const target = translations[to];
    if (!target) continue;
    const next = { ...translations, [from]: s.name };
    delete next[to];
    await prisma.service.update({ where: { id: s.id }, data: { name: target, translations: next } });
  }
  revalidatePath("/", "layout");
}
