"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/permissions";
import { getClinic } from "@/lib/clinic";
import { putFile } from "@/lib/storage";
import { docLocale, getDocT } from "@/lib/documents";

export type ConsentStatus = { id: string; signedAt: Date; method: string; marketing: boolean } | null;

export async function getConsentStatus(ownerId: string): Promise<ConsentStatus> {
  await requireUserId();
  return prisma.consent.findFirst({
    where: { ownerId, kind: "rgpd" },
    orderBy: { signedAt: "desc" },
    select: { id: true, signedAt: true, method: true, marketing: true },
  });
}

// Text the owner reads and accepts: the clinic's own (Settings) or the standard one, in a language
export async function getConsentText(lang?: string) {
  await requireUserId();
  const clinic = await getClinic();
  const settings = await prisma.clinicSettings.findUnique({ where: { id: "default" }, select: { consentText: true } });
  const locale = docLocale(lang, clinic.dataLocale);
  if (settings?.consentText?.trim()) return { locale, text: settings.consentText.trim(), custom: true };
  const t = await getDocT(locale);
  const address = [clinic.address, clinic.postalCode, clinic.city].filter(Boolean).join(", ");
  return {
    locale,
    custom: false,
    text: t("consentText", {
      clinic: clinic.legalName || clinic.name,
      nif: clinic.nif ?? "—",
      address: address || "—",
      email: clinic.email ?? clinic.phone ?? "—",
    }),
  };
}

const consentSchema = z.object({
  text: z.string().min(20).max(20000),
  method: z.enum(["SIGNATURE", "CHECKBOX"]),
  signature: z.string().max(2_000_000).optional(),
  reminders: z.boolean(),
  marketing: z.boolean(),
});

// Stores what the owner accepted, how (drawn signature or tick), when and on which device, and
// updates the owner's communication preferences
export async function recordConsent(ownerId: string, data: z.infer<typeof consentSchema>) {
  const userId = await requireUserId();
  const parsed = consentSchema.safeParse(data);
  if (!parsed.success) return { error: "invalid" as const };
  if (parsed.data.method === "SIGNATURE" && !parsed.data.signature?.startsWith("data:image/png;base64,")) {
    return { error: "signatureRequired" as const };
  }
  const userAgent = (await headers()).get("user-agent")?.slice(0, 300) ?? null;

  const consent = await prisma.consent.create({
    data: {
      ownerId,
      text: parsed.data.text,
      method: parsed.data.method,
      marketing: parsed.data.marketing,
      userAgent,
      recordedById: userId,
    },
  });
  if (parsed.data.signature) {
    const key = `consents/${ownerId}/${consent.id}.png`;
    await putFile(key, Buffer.from(parsed.data.signature.split(",")[1], "base64"), "image/png");
    await prisma.consent.update({ where: { id: consent.id }, data: { signatureKey: key } });
  }
  await prisma.owner.update({
    where: { id: ownerId },
    data: { marketingConsent: parsed.data.marketing, remindersConsent: parsed.data.reminders },
  });
  revalidatePath("/patients");
  return { consent: { id: consent.id, signedAt: consent.signedAt, method: consent.method, marketing: consent.marketing } };
}

export async function loadConsent(id: string) {
  await requireUserId();
  return prisma.consent.findUnique({
    where: { id },
    include: {
      owner: { select: { firstName: true, lastName: true, nif: true, phone: true, email: true, address: true, remindersConsent: true } },
      recordedBy: { select: { name: true } },
    },
  });
}
