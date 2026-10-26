"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Role } from "@prisma/client";
import { parseLicense } from "@/lib/license";

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

  const { name, country, defaultTaxRate, ...rest } = parsed.data;
  const nullable = Object.fromEntries(
    Object.entries(rest).map(([k, v]) => [k, v ? v : null])
  );

  await prisma.clinicSettings.upsert({
    where: { id: "default" },
    create: { id: "default", name, country, defaultTaxRate, ...nullable },
    update: { name, country, defaultTaxRate, ...nullable },
  });

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
