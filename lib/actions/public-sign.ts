"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { putFile } from "@/lib/storage";

// Used by the customer's signing page: no staff login, the private token is the only key. Only the
// document behind that token can be read or signed, once, before it expires.

async function findOpen(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  return prisma.consentRequest.findUnique({ where: { token } });
}

export type SignStatus = "open" | "signed" | "expired" | "notFound";

export async function getSignStatus(token: string): Promise<SignStatus> {
  const r = await findOpen(token);
  if (!r || r.cancelledAt) return "notFound";
  if (r.signedAt) return "signed";
  if (r.expiresAt < new Date()) return "expired";
  return "open";
}

const signSchema = z.object({
  accept: z.literal(true),
  reminders: z.boolean(),
  marketing: z.boolean(),
  signature: z.string().startsWith("data:image/png;base64,").max(2_000_000),
});

export async function submitRemoteSignature(token: string, input: z.input<typeof signSchema>): Promise<{ ok: true } | { error: string }> {
  const parsed = signSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid" };
  const r = await findOpen(token);
  if (!r || r.cancelledAt || r.signedAt || r.expiresAt < new Date()) return { error: "closed" };
  const h = await headers();
  const device = [h.get("user-agent")?.slice(0, 250), h.get("x-forwarded-for")?.split(",")[0]?.trim()].filter(Boolean).join(" | ");
  const isRgpd = r.kind === "rgpd";
  // The text says what was accepted, including the optional choices
  const text = isRgpd
    ? [r.text, "", `[x] ${r.lang === "ru" ? "Согласие на обработку данных" : r.lang === "en" ? "Data processing accepted" : "Acepta el tratamiento de datos"}`,
       `[${parsed.data.reminders ? "x" : " "}] ${r.lang === "ru" ? "Напоминания" : r.lang === "en" ? "Reminders" : "Recordatorios"}`,
       `[${parsed.data.marketing ? "x" : " "}] ${r.lang === "ru" ? "Реклама и новости" : r.lang === "en" ? "Offers and news" : "Promociones y novedades"}`].join("\n")
    : r.text;

  const consent = await prisma.$transaction(async (tx) => {
    // Claim the link first so a double tap cannot sign twice
    const claimed = await tx.consentRequest.updateMany({ where: { id: r.id, signedAt: null }, data: { signedAt: new Date() } });
    if (!claimed.count) return null;
    const c = await tx.consent.create({
      data: {
        ownerId: r.ownerId,
        kind: r.kind,
        text,
        method: "SIGNATURE",
        marketing: isRgpd && parsed.data.marketing,
        petIds: r.petIds,
        details: r.details ?? undefined,
        signerName: r.signerName,
        userAgent: `${device} | remote link`.slice(0, 300),
        recordedById: r.createdById,
      },
    });
    await tx.consentRequest.update({ where: { id: r.id }, data: { consentId: c.id } });
    if (isRgpd) {
      await tx.owner.update({
        where: { id: r.ownerId },
        data: { marketingConsent: parsed.data.marketing, remindersConsent: parsed.data.reminders },
      });
    }
    return c;
  });
  if (!consent) return { error: "closed" };
  const key = `consents/${r.ownerId}/${consent.id}.png`;
  await putFile(key, Buffer.from(parsed.data.signature.split(",")[1], "base64"), "image/png");
  await prisma.consent.update({ where: { id: consent.id }, data: { signatureKey: key } });
  return { ok: true };
}
