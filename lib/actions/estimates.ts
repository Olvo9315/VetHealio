"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { endOfDay } from "date-fns";
import type { InvoiceItemType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission, requireUserId } from "@/lib/permissions";
import { getClinic } from "@/lib/clinic";
import { cents, formatEur } from "@/lib/format";
import { docDate, docLocale, getDocT, whatsappNumber } from "@/lib/documents";
import { syncInvoiceStock } from "@/lib/stock";
import { formatEstimateId } from "@/lib/utils";

const ITEM_TYPES = ["CONSULTATION", "MEDICATION", "SERVICE", "OTHER"] as const;

const itemSchema = z.object({
  description: z.string().trim().min(1).max(300),
  quantity: z.coerce.number().int().positive(),
  unitPrice: z.coerce.number().min(0),
  taxRate: z.coerce.number().min(0).max(30),
  type: z.enum(ITEM_TYPES).optional(),
  serviceId: z.string().nullable().optional(),
  inventoryItemId: z.string().nullable().optional(),
});

const estimateSchema = z.object({
  petId: z.string().min(1),
  appointmentId: z.string().nullable().optional(),
  title: z.string().trim().min(1).max(150),
  notes: z.string().max(2000).optional(),
  validUntil: z.string().min(1),
  items: z.array(itemSchema).min(1).max(100),
});

export type EstimateInput = z.input<typeof estimateSchema>;

const include = {
  items: { orderBy: { sortOrder: "asc" as const } },
  pet: { select: { id: true, name: true, owner: { select: { firstName: true, lastName: true, phone: true, email: true } } } },
  invoice: { select: { id: true, number: true, createdAt: true, status: true } },
  createdBy: { select: { name: true } },
};

export type EstimateFull = {
  id: string;
  number: number;
  title: string;
  notes: string | null;
  validUntil: Date;
  status: string;
  decidedAt: Date | null;
  total: number;
  createdAt: Date;
  petId: string;
  appointmentId: string | null;
  invoiceId: string | null;
  items: { id: string; description: string; quantity: number; unitPrice: number; total: number; taxRate: number; type: InvoiceItemType | null; serviceId: string | null; inventoryItemId: string | null }[];
  pet: { id: string; name: string; owner: { firstName: string; lastName: string; phone: string; email: string | null } };
  invoice: { id: string; number: number; createdAt: Date; status: string } | null;
  createdBy: { name: string | null } | null;
};

export async function getPetEstimates(petId: string): Promise<EstimateFull[]> {
  await requireUserId();
  return prisma.estimate.findMany({ where: { petId }, include, orderBy: { createdAt: "desc" } }) as unknown as Promise<EstimateFull[]>;
}

// All estimates for the Finances tab: open ones (pending, not expired) first is up to the caller
export async function getEstimates(filter: "open" | "all" = "open"): Promise<EstimateFull[]> {
  await requireUserId();
  return prisma.estimate.findMany({
    where: filter === "open" ? { status: "PENDING", invoiceId: null, validUntil: { gte: new Date() } } : {},
    include,
    orderBy: { createdAt: "desc" },
    take: 200,
  }) as unknown as Promise<EstimateFull[]>;
}

export async function getEstimate(id: string): Promise<EstimateFull | null> {
  await requireUserId();
  return prisma.estimate.findUnique({ where: { id }, include }) as unknown as Promise<EstimateFull | null>;
}

// Lines are kept with VAT included; a clinic that prices before VAT has it added here
async function buildLines(items: z.infer<typeof itemSchema>[]) {
  const { pricesIncludeTax } = await getClinic();
  return items.map((i, idx) => {
    const unitPrice = pricesIncludeTax ? cents(i.unitPrice) : cents(i.unitPrice * (1 + i.taxRate / 100));
    return {
      description: i.description,
      quantity: i.quantity,
      unitPrice,
      total: cents(i.quantity * unitPrice),
      taxRate: i.taxRate,
      type: (i.type ?? "SERVICE") as InvoiceItemType,
      serviceId: i.serviceId ?? null,
      inventoryItemId: i.inventoryItemId ?? null,
      sortOrder: idx,
    };
  });
}

export async function saveEstimate(id: string | null, input: EstimateInput): Promise<{ estimate: EstimateFull } | { error: string }> {
  await requirePermission("invoice.write");
  const userId = await requireUserId();
  const parsed = estimateSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid" };
  const d = parsed.data;
  const lines = await buildLines(d.items);
  const total = cents(lines.reduce((s, l) => s + l.total, 0));
  const data = {
    title: d.title,
    notes: d.notes?.trim() || null,
    validUntil: endOfDay(new Date(d.validUntil)),
    total,
  };

  let estimateId = id;
  if (id) {
    const cur = await prisma.estimate.findUnique({ where: { id }, select: { invoiceId: true } });
    if (!cur) return { error: "notFound" };
    // Once it became an albarán the estimate is what the owner accepted: it stays as it was
    if (cur.invoiceId) return { error: "billed" };
    await prisma.$transaction([
      prisma.estimateItem.deleteMany({ where: { estimateId: id } }),
      prisma.estimate.update({ where: { id }, data: { ...data, items: { create: lines } } }),
    ]);
  } else {
    const created = await prisma.estimate.create({
      data: { ...data, petId: d.petId, appointmentId: d.appointmentId || null, createdById: userId, items: { create: lines } },
      select: { id: true },
    });
    estimateId = created.id;
  }
  revalidatePath(`/patients/${d.petId}`);
  revalidatePath("/finances");
  return { estimate: (await getEstimate(estimateId!))! };
}

export async function setEstimateStatus(id: string, status: "PENDING" | "ACCEPTED" | "REJECTED"): Promise<{ estimate: EstimateFull } | { error: string }> {
  await requirePermission("invoice.write");
  const cur = await prisma.estimate.findUnique({ where: { id }, select: { invoiceId: true } });
  if (!cur) return { error: "notFound" };
  if (cur.invoiceId) return { error: "billed" };
  await prisma.estimate.update({ where: { id }, data: { status, decidedAt: status === "PENDING" ? null : new Date() } });
  revalidatePath("/finances");
  return { estimate: (await getEstimate(id))! };
}

// The treatment is going ahead: an albarán with the same lines (pending payment). Products from
// stock are taken out of stock as with any bill. Linked to the estimate's visit if that has no bill yet.
export async function billEstimate(id: string): Promise<{ invoiceId: string } | { error: string }> {
  await requirePermission("invoice.write");
  const userId = await requireUserId();
  const est = await prisma.estimate.findUnique({ where: { id }, include: { items: { orderBy: { sortOrder: "asc" } } } });
  if (!est) return { error: "notFound" };
  if (est.invoiceId) return { invoiceId: est.invoiceId };
  const visitFree = est.appointmentId ? !(await prisma.invoice.findUnique({ where: { appointmentId: est.appointmentId }, select: { id: true } })) : false;

  const invoiceId = await prisma.$transaction(async (tx) => {
    const lines = est.items.map((i) => ({
      description: i.description,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      total: i.total,
      taxRate: i.taxRate,
      type: i.type,
      serviceId: i.serviceId,
      inventoryItemId: i.inventoryItemId,
    }));
    const inv = await tx.invoice.create({
      data: {
        petId: est.petId,
        appointmentId: visitFree ? est.appointmentId : null,
        totalAmount: est.total,
        items: { create: lines },
      },
      select: { id: true },
    });
    await syncInvoiceStock(tx, inv.id, lines, userId);
    await tx.estimate.update({ where: { id }, data: { invoiceId: inv.id, status: "ACCEPTED", decidedAt: new Date() } });
    return inv.id;
  });
  revalidatePath(`/patients/${est.petId}`);
  revalidatePath("/finances");
  return { invoiceId };
}

export async function deleteEstimate(id: string): Promise<{ ok: true } | { error: string }> {
  await requirePermission("invoice.write");
  const est = await prisma.estimate.findUnique({ where: { id }, select: { invoiceId: true, petId: true } });
  if (!est) return { error: "notFound" };
  if (est.invoiceId) return { error: "billed" };
  await prisma.estimate.delete({ where: { id } });
  revalidatePath(`/patients/${est.petId}`);
  revalidatePath("/finances");
  return { ok: true };
}

// Text for WhatsApp / e-mail in the owner's language
export async function getEstimateMessage(id: string, lang?: string) {
  const est = await getEstimate(id);
  if (!est) return null;
  const clinic = await getClinic();
  const locale = docLocale(lang, clinic.dataLocale);
  const t = await getDocT(locale);
  const lines = [
    t("estimateGreeting", { owner: est.pet.owner.firstName, pet: est.pet.name }),
    "",
    `${t("estimate")} ${formatEstimateId(est.number)} — ${est.title}`,
    ...est.items.map((i) => `• ${i.description}${i.quantity > 1 ? ` ×${i.quantity}` : ""}: ${formatEur(i.total)}`),
    "",
    `${t("total")}: ${formatEur(est.total)} (${t("vatIncluded")})`,
    t("validUntil", { date: docDate(est.validUntil, locale) }),
  ];
  if (est.notes) lines.push("", est.notes);
  lines.push("", clinic.phone ? `${clinic.name} · ${clinic.phone}` : clinic.name);
  return {
    text: lines.join("\n"),
    subject: `${t("estimate")} ${formatEstimateId(est.number)} · ${est.pet.name} · ${clinic.name}`,
    whatsapp: est.pet.owner.phone ? whatsappNumber(est.pet.owner.phone) : null,
    email: est.pet.owner.email,
  };
}

