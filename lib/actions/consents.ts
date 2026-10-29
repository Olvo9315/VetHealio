"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/permissions";
import { getClinic } from "@/lib/clinic";
import { putFile } from "@/lib/storage";
import { getTranslations } from "next-intl/server";
import { randomBytes } from "node:crypto";
import { docLocale, getDocT, whatsappNumber } from "@/lib/documents";
import { TREATMENT_CONSENTS, type ConsentDetails } from "@/lib/consents";

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
  kind: z.enum(["rgpd", ...TREATMENT_CONSENTS]).default("rgpd"),
  text: z.string().min(20).max(20000),
  method: z.enum(["SIGNATURE", "CHECKBOX"]),
  signature: z.string().max(2_000_000).optional(),
  reminders: z.boolean().default(true),
  marketing: z.boolean().default(false),
  petIds: z.array(z.string().min(1)).max(30).default([]),
  details: z.record(z.string(), z.string().max(2000)).optional(),
  signerName: z.string().max(150).optional(),
});

// Stores what the owner accepted, how (drawn signature or tick), when and on which device, and
// updates the owner's communication preferences
export async function recordConsent(ownerId: string, data: z.input<typeof consentSchema>) {
  const userId = await requireUserId();
  const parsed = consentSchema.safeParse(data);
  if (!parsed.success) return { error: "invalid" as const };
  if (parsed.data.method === "SIGNATURE" && !parsed.data.signature?.startsWith("data:image/png;base64,")) {
    return { error: "signatureRequired" as const };
  }
  const userAgent = (await headers()).get("user-agent")?.slice(0, 300) ?? null;

  const isRgpd = parsed.data.kind === "rgpd";
  // Only the owner's own pets can be covered
  const petIds = parsed.data.petIds.length
    ? (await prisma.pet.findMany({ where: { id: { in: parsed.data.petIds }, ownerId }, select: { id: true } })).map((p) => p.id)
    : [];
  const consent = await prisma.consent.create({
    data: {
      ownerId,
      kind: parsed.data.kind,
      text: parsed.data.text,
      method: parsed.data.method,
      marketing: isRgpd && parsed.data.marketing,
      petIds,
      details: parsed.data.details ?? undefined,
      signerName: parsed.data.signerName?.trim() || null,
      userAgent,
      recordedById: userId,
    },
  });
  if (parsed.data.signature) {
    const key = `consents/${ownerId}/${consent.id}.png`;
    await putFile(key, Buffer.from(parsed.data.signature.split(",")[1], "base64"), "image/png");
    await prisma.consent.update({ where: { id: consent.id }, data: { signatureKey: key } });
  }
  if (isRgpd) {
    await prisma.owner.update({
      where: { id: ownerId },
      data: { marketingConsent: parsed.data.marketing, remindersConsent: parsed.data.reminders },
    });
  }
  revalidatePath("/patients");
  revalidatePath(`/owners/${ownerId}`);
  return { consent: { id: consent.id, signedAt: consent.signedAt, method: consent.method, marketing: consent.marketing } };
}

export async function loadConsent(id: string) {
  await requireUserId();
  const consent = await prisma.consent.findUnique({
    where: { id },
    include: {
      owner: { select: { firstName: true, lastName: true, nif: true, phone: true, email: true, address: true, remindersConsent: true } },
      recordedBy: { select: { name: true } },
    },
  });
  if (!consent) return null;
  const pets = consent.petIds.length
    ? await prisma.pet.findMany({ where: { id: { in: consent.petIds } }, select: { name: true, species: true, microchipNumber: true } })
    : [];
  return { ...consent, pets };
}

export type OwnerDocument = { id: string; kind: string; signedAt: Date; method: string; petNames: string[]; procedure: string | null; signerName: string | null };

// Everything an owner has signed, newest first
export async function getOwnerDocuments(ownerId: string): Promise<OwnerDocument[]> {
  await requireUserId();
  const [consents, pets] = await Promise.all([
    prisma.consent.findMany({ where: { ownerId }, orderBy: { signedAt: "desc" } }),
    prisma.pet.findMany({ where: { ownerId }, select: { id: true, name: true } }),
  ]);
  const names = new Map(pets.map((p) => [p.id, p.name]));
  return consents.map((c) => ({
    id: c.id,
    kind: c.kind,
    signedAt: c.signedAt,
    method: c.method,
    petNames: c.petIds.map((id) => names.get(id)).filter((n): n is string => !!n),
    procedure: (c.details as ConsentDetails | null)?.procedure ?? null,
    signerName: c.signerName,
  }));
}

// Staff who can sign as the responsible vet, with their registration number (nº de colegiado)
export async function getConsentVets() {
  await requireUserId();
  const vets = await prisma.user.findMany({
    where: { role: { in: ["ADMIN", "VETERINARIAN"] } },
    select: { id: true, name: true, staffProfile: { select: { licenseNumber: true } } },
    orderBy: { name: "asc" },
  });
  return vets.map((v) => ({ id: v.id, name: v.name, license: v.staffProfile?.licenseNumber ?? "" }));
}

const treatmentTextSchema = z.object({
  kind: z.enum(TREATMENT_CONSENTS),
  petIds: z.array(z.string()).min(1).max(30),
  details: z.record(z.string(), z.string().max(2000)),
  signerName: z.string().max(150).optional(),
  lang: z.string().optional(),
});

// Text of an informed consent for veterinary acts, filled in for this owner, these pets and this
// procedure, in the language the owner reads
export async function getTreatmentConsentText(ownerId: string, input: z.input<typeof treatmentTextSchema>) {
  await requireUserId();
  const data = treatmentTextSchema.parse(input);
  const [clinic, owner, pets] = await Promise.all([
    getClinic(),
    prisma.owner.findUniqueOrThrow({ where: { id: ownerId }, select: { firstName: true, lastName: true, nif: true } }),
    prisma.pet.findMany({ where: { id: { in: data.petIds }, ownerId }, select: { name: true, species: true, breed: true, microchipNumber: true } }),
  ]);
  const locale = docLocale(data.lang, clinic.dataLocale);
  const t = await getDocT(locale);
  const tp = await getTranslations({ locale, namespace: "patients" });
  const d = data.details as ConsentDetails;
  const petLine = pets
    .map((p) => [p.name, tp(p.species.toLowerCase()), p.breed, p.microchipNumber ? `${t("chip")} ${p.microchipNumber}` : null].filter(Boolean).join(", "))
    .join("; ");
  const ownerName = `${owner.firstName} ${owner.lastName}`.trim();
  const lines = [
    t(`consentKind_${data.kind}`).toUpperCase(),
    "",
    data.signerName?.trim()
      ? t("consentSignerAuthorised", { signer: data.signerName.trim(), owner: ownerName })
      : t("consentSignerOwner", { owner: ownerName, nif: owner.nif ?? "—" }),
    `${t("consentAnimals")}: ${petLine}`,
    `${t("consentClinic")}: ${clinic.legalName || clinic.name}${clinic.nif ? ` (NIF ${clinic.nif})` : ""}`,
    `${t("consentVet")}: ${d.vetName || "—"}${d.vetLicense ? ` · ${t("consentLicense")} ${d.vetLicense}` : ""}`,
    "",
  ];
  if (d.procedure?.trim()) lines.push(`${t(data.kind === "euthanasia" || data.kind === "necropsy" ? "consentReason" : "consentProcedure")}: ${d.procedure.trim()}`);
  if (d.risks?.trim()) lines.push(`${t("consentRisks")}: ${d.risks.trim()}`);
  if (d.alternatives?.trim()) lines.push(`${t("consentAlternatives")}: ${d.alternatives.trim()}`);
  if (d.bodyDestination) lines.push(`${t("consentBody")}: ${t(`consentBody_${d.bodyDestination}`)}`);
  if (d.cost?.trim()) lines.push(`${t("consentCost")}: ${d.cost.trim()}`);
  lines.push("", t(`consentBody_text_${data.kind}`), "", t("consentClosing"));
  return { locale, text: lines.join("\n") };
}

// ---- Signing on the customer's own phone ----

const requestSchema = z.object({
  kind: z.enum(["rgpd", ...TREATMENT_CONSENTS]),
  text: z.string().min(20).max(20000),
  lang: z.enum(["es", "ru", "en"]),
  petIds: z.array(z.string()).max(30).default([]),
  details: z.record(z.string(), z.string().max(2000)).optional(),
  signerName: z.string().max(150).optional(),
});

const LINK_DAYS = 7;

// A private link to the document for the owner to sign on their phone. Sent by WhatsApp or e-mail
// from the staff member's device; it can be used once and expires in a week.
export async function createConsentRequest(ownerId: string, input: z.input<typeof requestSchema>) {
  const userId = await requireUserId();
  const data = requestSchema.parse(input);
  const owner = await prisma.owner.findUniqueOrThrow({ where: { id: ownerId }, select: { firstName: true, phone: true, email: true } });
  const petIds = data.petIds.length
    ? (await prisma.pet.findMany({ where: { id: { in: data.petIds }, ownerId }, select: { id: true } })).map((p) => p.id)
    : [];
  const token = randomBytes(24).toString("base64url");
  await prisma.consentRequest.create({
    data: {
      token,
      ownerId,
      kind: data.kind,
      text: data.text,
      lang: data.lang,
      petIds,
      details: { ...(data.details ?? {}), lang: data.lang },
      signerName: data.signerName?.trim() || null,
      expiresAt: new Date(Date.now() + LINK_DAYS * 24 * 3600 * 1000),
      createdById: userId,
    },
  });
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  const url = `${proto}://${host}/sign/${token}`;
  const clinic = await getClinic();
  const t = await getDocT(data.lang);
  const message = t(data.kind === "rgpd" ? "signLinkMessageRgpd" : "signLinkMessageTreatment", { owner: owner.firstName, clinic: clinic.name, url, days: LINK_DAYS });
  revalidatePath(`/owners/${ownerId}`);
  return {
    url,
    message,
    subject: t("signLinkSubject", { clinic: clinic.name }),
    whatsapp: owner.phone ? whatsappNumber(owner.phone) : null,
    email: owner.email,
  };
}

export type PendingSignature = { id: string; kind: string; createdAt: Date; expiresAt: Date; petNames: string[]; by: string | null };

// Links sent and not signed yet (still valid)
export async function getPendingSignatures(ownerId: string): Promise<PendingSignature[]> {
  await requireUserId();
  const [requests, pets] = await Promise.all([
    prisma.consentRequest.findMany({
      where: { ownerId, signedAt: null, cancelledAt: null, expiresAt: { gt: new Date() } },
      include: { createdBy: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.pet.findMany({ where: { ownerId }, select: { id: true, name: true } }),
  ]);
  const names = new Map(pets.map((p) => [p.id, p.name]));
  return requests.map((r) => ({
    id: r.id,
    kind: r.kind,
    createdAt: r.createdAt,
    expiresAt: r.expiresAt,
    petNames: r.petIds.map((id) => names.get(id)).filter((n): n is string => !!n),
    by: r.createdBy?.name ?? null,
  }));
}

export async function cancelConsentRequest(id: string) {
  await requireUserId();
  const r = await prisma.consentRequest.update({ where: { id }, data: { cancelledAt: new Date() }, select: { ownerId: true } });
  revalidatePath(`/owners/${r.ownerId}`);
}
