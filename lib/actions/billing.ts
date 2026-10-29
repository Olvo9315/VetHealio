"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma, PaymentMethod, type InvoiceKind } from "@prisma/client";
import { endOfDay, startOfDay } from "date-fns";
import { prisma } from "@/lib/prisma";
import { requirePermission, requireUserId } from "@/lib/permissions";
import { cents } from "@/lib/format";
import { docNumber, dueOf, taxBreakdown, type DocLine } from "@/lib/billing";
import { getInvoiceById, type InvoiceFull } from "@/lib/actions/invoices";
import { buildAdviserPackage } from "@/lib/adviser-package";
import { emailConfigured, sendWithAttachments } from "@/lib/email";
import { chainPendingDocuments } from "@/lib/verifactu";

type Tx = Prisma.TransactionClient;

function touch(petId?: string) {
  revalidatePath("/finances");
  revalidatePath("/appointments");
  if (petId) revalidatePath(`/patients/${petId}`);
}

// ---- Payments ----

const paymentSchema = z.object({
  amount: z.coerce.number().positive().max(1_000_000),
  method: z.nativeEnum(PaymentMethod),
  note: z.string().max(200).optional(),
});

// Adds a payment to a bill (partial payments allowed). A bill paid in full gets its ticket at once.
export async function recordPayment(invoiceId: string, data: z.infer<typeof paymentSchema>): Promise<{ invoice: InvoiceFull } | { error: string }> {
  await requirePermission("invoice.write");
  const userId = await requireUserId();
  const parsed = paymentSchema.safeParse(data);
  if (!parsed.success) return { error: "invalid" };

  const inv = await prisma.invoice.findUnique({ where: { id: invoiceId }, select: { status: true, totalAmount: true, paidAmount: true, petId: true } });
  if (!inv || inv.status === "CANCELLED") return { error: "notPayable" };
  const due = dueOf(inv);
  if (due <= 0) return { error: "alreadyPaid" };
  // Paying more than owed is the change given back, not an overpayment
  const amount = Math.min(cents(parsed.data.amount), due);

  await withNumberRetry(() =>
    prisma.$transaction(async (tx) => {
      await addPayment(tx, invoiceId, amount, parsed.data.method, userId, parsed.data.note);
    })
  );
  touch(inv.petId);
  return { invoice: (await getInvoiceById(invoiceId))! };
}

async function addPayment(tx: Tx, invoiceId: string, amount: number, method: PaymentMethod, userId: string, note?: string) {
  await tx.payment.create({ data: { invoiceId, amount, method, note: note || null, receivedById: userId } });
  const updated = await tx.invoice.update({
    where: { id: invoiceId },
    data: { paidAmount: { increment: amount }, paymentMethod: method, paidAt: new Date() },
    select: { totalAmount: true, paidAmount: true },
  });
  if (updated.paidAmount + 0.005 >= updated.totalAmount) {
    await tx.invoice.update({ where: { id: invoiceId }, data: { status: "PAID", paidAmount: updated.totalAmount } });
    const hasDoc = await tx.fiscalDocument.count({ where: { invoiceId } });
    if (!hasDoc) await issueDocument(tx, invoiceId, "SIMPLIFIED", userId);
  }
}

// Voids a payment entered by mistake (the money was never taken). Nothing is deleted: the payment
// stays on the bill crossed out, with who voided it, when and why, and the day's cash count shows the
// correction. Fiscal documents stay as they are: an invoice records the service, not the payment, so
// the bill simply becomes owed again. A cancelled bill stays cancelled.
export async function voidPayment(paymentId: string, reason: string): Promise<{ invoice: InvoiceFull; paymentId: string } | { error: string }> {
  await requirePermission("invoice.void");
  const userId = await requireUserId();
  const why = reason.trim().slice(0, 300);
  if (why.length < 3) return { error: "reasonRequired" };
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: { invoiceId: true, amount: true, voidedAt: true, invoice: { select: { petId: true, status: true } } },
  });
  if (!payment || payment.voidedAt) return { error: "notFound" };
  await prisma.$transaction(async (tx) => {
    await tx.payment.update({ where: { id: paymentId }, data: { voidedAt: new Date(), voidReason: why, voidedById: userId } });
    const inv = await tx.invoice.update({
      where: { id: payment.invoiceId },
      data: {
        paidAmount: { decrement: payment.amount },
        ...(payment.invoice.status === "PAID" ? { status: "PENDING" as const } : {}),
      },
      select: { paidAmount: true },
    });
    if (Math.abs(inv.paidAmount) < 0.005) {
      await tx.invoice.update({ where: { id: payment.invoiceId }, data: { paidAmount: 0, paidAt: null, paymentMethod: null } });
    }
  });
  touch(payment.invoice.petId);
  return { invoice: (await getInvoiceById(payment.invoiceId))!, paymentId };
}

// Gives back money received for a cancelled bill: a negative payment, so the cash count of the day
// shows the money going out
export async function refundBill(invoiceId: string, method: PaymentMethod): Promise<{ invoice: InvoiceFull } | { error: string }> {
  await requirePermission("invoice.void");
  const userId = await requireUserId();
  const inv = await prisma.invoice.findUnique({ where: { id: invoiceId }, select: { status: true, paidAmount: true, petId: true } });
  if (!inv || inv.status !== "CANCELLED" || inv.paidAmount < 0.005) return { error: "nothingToRefund" };
  const amount = cents(inv.paidAmount);
  await prisma.$transaction([
    prisma.payment.create({ data: { invoiceId, amount: -amount, method, note: "refund", receivedById: userId } }),
    prisma.invoice.update({ where: { id: invoiceId }, data: { paidAmount: 0 } }),
  ]);
  touch(inv.petId);
  return { invoice: (await getInvoiceById(invoiceId))! };
}

// A bill cancelled by mistake (the service was given): the same lines again as a new bill to pay.
// The cancelled one and its rectifying invoice stay on record; the visit moves to the new bill.
export async function rebill(invoiceId: string): Promise<{ invoice: InvoiceFull } | { error: string }> {
  await requirePermission("invoice.write");
  const old = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      status: true,
      petId: true,
      appointmentId: true,
      items: { select: { description: true, quantity: true, unitPrice: true, total: true, type: true, taxRate: true, serviceId: true } },
    },
  });
  if (!old || old.status !== "CANCELLED") return { error: "notCancelled" };
  const created = await prisma.$transaction(async (tx) => {
    if (old.appointmentId) await tx.invoice.update({ where: { id: invoiceId }, data: { appointmentId: null } });
    return tx.invoice.create({
      data: {
        petId: old.petId,
        appointmentId: old.appointmentId,
        totalAmount: cents(old.items.reduce((s, i) => s + i.total, 0)),
        // Products were already taken out of stock by the first bill
        items: { create: old.items },
      },
      select: { id: true },
    });
  });
  touch(old.petId);
  return { invoice: (await getInvoiceById(created.id))! };
}

// ---- Owner debt ----

export type DebtBill = {
  id: string;
  number: number;
  createdAt: Date;
  petName: string;
  title: string | null;
  total: number;
  paid: number;
  due: number;
};

// Everything an owner still owes, across all their pets, oldest first
export async function getOwnerDebt(ownerId: string): Promise<{ total: number; bills: DebtBill[] }> {
  await requireUserId();
  const bills = await prisma.invoice.findMany({
    where: { status: "PENDING", pet: { ownerId } },
    select: { id: true, number: true, createdAt: true, totalAmount: true, paidAmount: true, status: true, pet: { select: { name: true } }, appointment: { select: { title: true } } },
    orderBy: { createdAt: "asc" },
  });
  const rows = bills
    .map((b) => ({
      id: b.id,
      number: b.number,
      createdAt: b.createdAt,
      petName: b.pet.name,
      title: b.appointment?.title ?? null,
      total: b.totalAmount,
      paid: b.paidAmount,
      due: dueOf(b),
    }))
    .filter((b) => b.due > 0);
  return { total: cents(rows.reduce((s, b) => s + b.due, 0)), bills: rows };
}

// One payment spread over the owner's bills, oldest first (or only over the chosen ones)
export async function payOwnerDebt(
  ownerId: string,
  data: z.infer<typeof paymentSchema> & { invoiceIds?: string[] }
): Promise<{ paid: number; bills: number } | { error: string }> {
  await requirePermission("invoice.write");
  const userId = await requireUserId();
  const parsed = paymentSchema.safeParse(data);
  if (!parsed.success) return { error: "invalid" };
  const { bills } = await getOwnerDebt(ownerId);
  const chosen = data.invoiceIds?.length ? bills.filter((b) => data.invoiceIds!.includes(b.id)) : bills;
  let left = 0;
  let count = 0;
  await withNumberRetry(() =>
    prisma.$transaction(async (tx) => {
      left = cents(parsed.data.amount);
      count = 0;
      for (const b of chosen) {
        if (left <= 0) break;
        const amount = Math.min(left, b.due);
        await addPayment(tx, b.id, amount, parsed.data.method, userId, parsed.data.note);
        left = cents(left - amount);
        count++;
      }
    })
  );
  touch();
  revalidatePath("/patients");
  return { paid: cents(parsed.data.amount - left), bills: count };
}

// ---- Fiscal documents ----

const SERIES_FIELD: Record<InvoiceKind, "seriesSimplified" | "seriesFull" | "seriesRectifying"> = {
  SIMPLIFIED: "seriesSimplified",
  FULL: "seriesFull",
  RECTIFYING: "seriesRectifying",
};

// Numbers are consecutive per series and year, with no gaps: taken inside the transaction that
// writes the document, retried if two documents race for the same number.
async function nextNumber(tx: Tx, series: string, year: number) {
  const last = await tx.fiscalDocument.aggregate({ where: { series, year }, _max: { number: true } });
  return (last._max.number ?? 0) + 1;
}

async function issueDocument(
  tx: Tx,
  invoiceId: string,
  kind: InvoiceKind,
  userId: string,
  opts: { replacesId?: string; negate?: boolean; reason?: string; customer?: { name: string; nif: string | null; address: string | null } } = {}
) {
  const [inv, settings] = await Promise.all([
    tx.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      select: {
        totalAmount: true,
        appointment: { select: { title: true } },
        items: { select: { description: true, quantity: true, unitPrice: true, taxRate: true, total: true } },
        pet: { select: { owner: { select: { firstName: true, lastName: true, nif: true, address: true, postalCode: true } } } },
      },
    }),
    tx.clinicSettings.upsert({ where: { id: "default" }, create: { id: "default" }, update: {} }),
  ]);
  const sign = opts.negate ? -1 : 1;
  // Older bills may carry only a total: document it as one line at the clinic's VAT rate
  const items = inv.items.length
    ? inv.items
    : [{ description: inv.appointment?.title || "Servicios veterinarios", quantity: 1, unitPrice: inv.totalAmount, taxRate: settings.defaultTaxRate, total: inv.totalAmount }];
  const lines: DocLine[] = items.map((i) => ({
    description: i.description,
    quantity: sign * i.quantity,
    unitPrice: i.unitPrice,
    taxRate: i.taxRate,
    total: cents(sign * i.total),
  }));
  const tax = taxBreakdown(lines);
  const owner = inv.pet.owner;
  const customer = opts.customer ?? {
    name: `${owner.firstName} ${owner.lastName}`.trim(),
    nif: owner.nif,
    address: [owner.address, owner.postalCode].filter(Boolean).join(", ") || null,
  };
  const series = settings[SERIES_FIELD[kind]] || kind[0];
  const year = new Date().getFullYear();
  const doc = await tx.fiscalDocument.create({
    data: {
      kind,
      series,
      year,
      number: await nextNumber(tx, series, year),
      customerName: customer.name,
      customerNif: customer.nif,
      customerAddress: customer.address,
      lines,
      taxBreakdown: tax.rows,
      taxBase: tax.base,
      taxAmount: tax.tax,
      total: tax.total,
      reason: opts.reason ?? null,
      invoiceId,
      replacesId: opts.replacesId ?? null,
      issuedById: userId,
    },
  });
  // Its VeriFactu record, chained to the previous one
  await chainPendingDocuments(tx);
  return doc;
}

async function withNumberRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt < 3 && e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
      throw e;
    }
  }
}

// The document currently in force for a bill: the latest one nothing has replaced
async function activeDocument(tx: Tx, invoiceId: string) {
  const docs = await tx.fiscalDocument.findMany({ where: { invoiceId }, orderBy: { issuedAt: "asc" }, select: { id: true, kind: true, replacesId: true } });
  const replaced = new Set(docs.map((d) => d.replacesId).filter(Boolean));
  return docs.filter((d) => !replaced.has(d.id) && d.kind !== "RECTIFYING").pop() ?? null;
}

const customerSchema = z.object({
  name: z.string().min(1).max(150),
  nif: z.string().min(5).max(20),
  address: z.string().max(250).optional(),
});

// Full invoice with the customer's tax details. If a ticket was already given, the full invoice
// replaces it (the ticket stays on record as replaced). The NIF is saved on the owner for next time.
export async function issueFullInvoice(invoiceId: string, customer: z.infer<typeof customerSchema>): Promise<{ invoice: InvoiceFull } | { error: string }> {
  await requirePermission("invoice.write");
  const userId = await requireUserId();
  const parsed = customerSchema.safeParse({ ...customer, nif: customer.nif?.trim().toUpperCase() });
  if (!parsed.success) return { error: "customerRequired" };
  const inv = await prisma.invoice.findUnique({ where: { id: invoiceId }, select: { status: true, petId: true, pet: { select: { ownerId: true, owner: { select: { nif: true, address: true } } } } } });
  if (!inv || inv.status === "CANCELLED") return { error: "notPayable" };

  await withNumberRetry(() =>
    prisma.$transaction(async (tx) => {
      const active = await activeDocument(tx, invoiceId);
      if (active?.kind === "FULL") throw new Error("alreadyFull");
      await issueDocument(tx, invoiceId, "FULL", userId, {
        replacesId: active?.id,
        customer: { name: parsed.data.name, nif: parsed.data.nif, address: parsed.data.address || null },
      });
      if (!inv.pet.owner.nif || (parsed.data.address && !inv.pet.owner.address)) {
        await tx.owner.update({
          where: { id: inv.pet.ownerId },
          data: { nif: inv.pet.owner.nif ?? parsed.data.nif, ...(!inv.pet.owner.address && parsed.data.address ? { address: parsed.data.address } : {}) },
        });
      }
    })
  ).catch((e) => {
    if (e instanceof Error && e.message === "alreadyFull") return;
    throw e;
  });
  touch(inv.petId);
  return { invoice: (await getInvoiceById(invoiceId))! };
}

// Cancels a bill. Not issued yet: it is simply marked cancelled. Issued: a rectifying document with
// negative amounts cancels the document in force, as Spanish rules require (nothing is deleted).
export async function cancelBill(invoiceId: string, reason: string): Promise<{ invoice: InvoiceFull } | { error: string }> {
  await requirePermission("invoice.void");
  const userId = await requireUserId();
  const inv = await prisma.invoice.findUnique({ where: { id: invoiceId }, select: { status: true, petId: true } });
  if (!inv || inv.status === "CANCELLED") return { error: "notFound" };

  await withNumberRetry(() =>
    prisma.$transaction(async (tx) => {
      const active = await activeDocument(tx, invoiceId);
      if (active) {
        await issueDocument(tx, invoiceId, "RECTIFYING", userId, { replacesId: active.id, negate: true, reason: reason.slice(0, 300) || undefined });
      }
      await tx.invoice.update({ where: { id: invoiceId }, data: { status: "CANCELLED" } });
    })
  );
  touch(inv.petId);
  return { invoice: (await getInvoiceById(invoiceId))! };
}

// Tickets for bills paid in a period that still have none (bills paid before this version, or
// paid while ticketing was off) — the monthly "invoice all visits" step of older programs.
export async function issuePendingTickets(fromDay: string, toDay: string): Promise<{ issued: number }> {
  await requirePermission("invoice.write");
  const userId = await requireUserId();
  const { from, to } = dayRange(fromDay, toDay);
  const bills = await prisma.invoice.findMany({
    where: { status: "PAID", paidAt: { gte: from, lte: to }, documents: { none: {} } },
    select: { id: true },
    orderBy: { paidAt: "asc" },
  });
  for (const b of bills) {
    await withNumberRetry(() => prisma.$transaction((tx) => issueDocument(tx, b.id, "SIMPLIFIED", userId)));
  }
  touch();
  return { issued: bills.length };
}

// ---- Reports ----

export type BookRow = {
  id: string;
  kind: InvoiceKind;
  docNumber: string;
  series: string;
  year: number;
  number: number;
  issuedAt: Date;
  customerName: string;
  customerNif: string | null;
  taxBreakdown: { rate: number; base: number; tax: number }[];
  taxBase: number;
  taxAmount: number;
  total: number;
  replacedBy: string | null;
  replaces: string | null;
  invoiceId: string;
  petId: string;
  // When it first went to the tax adviser
  sentAt: Date | null;
};

export type AdviserExportRow = { id: string; periodFrom: Date; periodTo: Date; method: string; sentTo: string | null; docCount: number; total: number; createdAt: Date; by: string | null };

export type InvoiceBook = {
  rows: BookRow[];
  pendingTickets: number;
  clinicNifMissing: boolean;
  adviserEmail: string | null;
  // Earlier hand-overs that overlap this period
  exports: AdviserExportRow[];
  // This instance can send e-mail
  emailReady: boolean;
};

// Whole days, both included, from "yyyy-MM-dd"
function dayRange(fromDay: string, toDay: string) {
  return { from: startOfDay(new Date(`${fromDay}T12:00:00`)), to: endOfDay(new Date(`${toDay}T12:00:00`)) };
}

// Book of issued invoices for a period (libro registro de facturas emitidas), for the tax adviser.
// Tickets replaced by a full invoice are listed but not counted in the totals.
export async function getInvoiceBook(fromDay: string, toDay: string): Promise<InvoiceBook> {
  await requirePermission("invoice.write");
  const { from, to } = dayRange(fromDay, toDay);
  const [docs, pendingTickets, settings, exports] = await Promise.all([
    prisma.fiscalDocument.findMany({
      where: { issuedAt: { gte: from, lte: to } },
      include: {
        replacedBy: { select: { series: true, year: true, number: true, kind: true } },
        replaces: { select: { series: true, year: true, number: true } },
        invoice: { select: { petId: true } },
        export: { select: { createdAt: true } },
      },
      orderBy: [{ series: "asc" }, { year: "asc" }, { number: "asc" }],
    }),
    prisma.invoice.count({ where: { status: "PAID", paidAt: { gte: from, lte: to }, documents: { none: {} } } }),
    prisma.clinicSettings.findUnique({ where: { id: "default" }, select: { nif: true, adviserEmail: true } }),
    prisma.adviserExport.findMany({
      where: { periodFrom: { lte: to }, periodTo: { gte: from } },
      include: { createdBy: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return {
    pendingTickets,
    clinicNifMissing: !settings?.nif,
    adviserEmail: settings?.adviserEmail ?? null,
    exports: exports.map((e) => ({ ...e, by: e.createdBy?.name ?? null })),
    emailReady: emailConfigured(),
    rows: docs.map((d) => {
      const replacement = d.replacedBy.find((r) => r.kind === "FULL");
      return {
        id: d.id,
        kind: d.kind,
        docNumber: docNumber(d),
        series: d.series,
        year: d.year,
        number: d.number,
        issuedAt: d.issuedAt,
        customerName: d.customerName,
        customerNif: d.customerNif,
        taxBreakdown: d.taxBreakdown as BookRow["taxBreakdown"],
        taxBase: d.taxBase,
        taxAmount: d.taxAmount,
        total: d.total,
        replacedBy: replacement ? docNumber(replacement) : null,
        replaces: d.replaces ? docNumber(d.replaces) : null,
        invoiceId: d.invoiceId,
        petId: d.invoice.petId,
        sentAt: d.export?.createdAt ?? null,
      };
    }),
  };
}

// Records that the period went to the adviser: documents not sent before get this export
export async function recordAdviserExport(fromDay: string, toDay: string, method: "EMAIL" | "MANUAL", sentTo?: string) {
  await requirePermission("invoice.write");
  const userId = await requireUserId();
  const { from, to } = dayRange(fromDay, toDay);
  const docs = await prisma.fiscalDocument.findMany({
    where: { issuedAt: { gte: from, lte: to } },
    select: { id: true, total: true, replacedBy: { select: { kind: true } } },
  });
  const counted = docs.filter((d) => !d.replacedBy.some((r) => r.kind === "FULL"));
  const exp = await prisma.adviserExport.create({
    data: {
      periodFrom: from,
      periodTo: to,
      method,
      sentTo: sentTo ?? null,
      docCount: docs.length,
      total: cents(counted.reduce((s, d) => s + d.total, 0)),
      createdById: userId,
    },
  });
  await prisma.fiscalDocument.updateMany({ where: { id: { in: docs.map((d) => d.id) }, exportId: null }, data: { exportId: exp.id } });
  revalidatePath("/finances");
  return { id: exp.id, docCount: docs.length };
}

export type CashRow = {
  id: string;
  // payment | refund | void (a correction cancelling an earlier payment)
  kind: "payment" | "refund" | "void";
  amount: number;
  method: PaymentMethod;
  at: Date;
  by: string | null;
  customer: string;
  petName: string;
  billNumber: number;
  invoiceId: string;
  petId: string;
  voided: boolean;
  reason: string | null;
};

export type CashReport = {
  payments: CashRow[];
  byMethod: { method: PaymentMethod; amount: number; count: number }[];
  byEmployee: { name: string; amount: number; count: number }[];
  total: number;
};

// Money movements of a day (or range): payments and refunds when they happened, and voided payments as
// a negative correction on the day they were voided, so nothing silently disappears from the count
export async function getCashReport(fromDay: string, toDay?: string): Promise<CashReport> {
  await requirePermission("invoice.write");
  const from = startOfDay(new Date(`${fromDay}T12:00:00`));
  const to = endOfDay(new Date(`${toDay ?? fromDay}T12:00:00`));
  const select = {
    id: true,
    amount: true,
    method: true,
    paidAt: true,
    voidedAt: true,
    voidReason: true,
    receivedBy: { select: { name: true } },
    voidedBy: { select: { name: true } },
    invoice: { select: { id: true, number: true, petId: true, pet: { select: { name: true, owner: { select: { firstName: true, lastName: true } } } } } },
  } as const;
  const [taken, voided] = await Promise.all([
    prisma.payment.findMany({ where: { paidAt: { gte: from, lte: to } }, select }),
    prisma.payment.findMany({ where: { voidedAt: { gte: from, lte: to } }, select }),
  ]);
  type P = (typeof taken)[number];
  const base = (p: P) => ({
    method: p.method,
    customer: `${p.invoice.pet.owner.firstName} ${p.invoice.pet.owner.lastName}`,
    petName: p.invoice.pet.name,
    billNumber: p.invoice.number,
    invoiceId: p.invoice.id,
    petId: p.invoice.petId,
  });
  const rows: CashRow[] = [
    ...taken.map((p) => ({
      ...base(p),
      id: p.id,
      kind: (p.amount < 0 ? "refund" : "payment") as CashRow["kind"],
      amount: p.amount,
      at: p.paidAt,
      by: p.receivedBy?.name ?? null,
      voided: !!p.voidedAt,
      reason: null,
    })),
    ...voided.map((p) => ({
      ...base(p),
      id: `${p.id}-void`,
      kind: "void" as const,
      amount: -p.amount,
      at: p.voidedAt!,
      by: p.voidedBy?.name ?? null,
      voided: false,
      reason: p.voidReason,
    })),
  ].sort((a, b) => +new Date(a.at) - +new Date(b.at));
  const group = <K extends string>(key: (r: CashRow) => K) => {
    const m = new Map<K, { amount: number; count: number }>();
    for (const r of rows) {
      const k = key(r);
      const cur = m.get(k) ?? { amount: 0, count: 0 };
      m.set(k, { amount: cents(cur.amount + r.amount), count: cur.count + 1 });
    }
    return Array.from(m.entries());
  };
  return {
    payments: rows,
    byMethod: group((r) => r.method).map(([method, v]) => ({ method, ...v })),
    byEmployee: group((r) => r.by ?? "—").map(([name, v]) => ({ name, ...v })),
    total: cents(rows.reduce((s, r) => s + r.amount, 0)),
  };
}

// One payment, refund or voided payment, for a printed receipt
export async function loadPaymentReceipt(paymentId: string) {
  await requireUserId();
  return prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      receivedBy: { select: { name: true } },
      voidedBy: { select: { name: true } },
      invoice: {
        select: {
          number: true,
          createdAt: true,
          totalAmount: true,
          paidAmount: true,
          status: true,
          pet: { select: { name: true, owner: { select: { firstName: true, lastName: true, nif: true } } } },
          documents: { select: { series: true, year: true, number: true, kind: true, replacesId: true, id: true }, orderBy: { issuedAt: "asc" } },
        },
      },
    },
  });
}

// Data for printing one fiscal document
export async function loadFiscalDocument(id: string) {
  await requireUserId();
  return prisma.fiscalDocument.findUnique({
    where: { id },
    include: {
      replaces: { select: { series: true, year: true, number: true, issuedAt: true } },
      verifactu: { select: { issuerNif: true, numSerie: true, issueDate: true, totalAmount: true } },
      invoice: {
        select: {
          number: true,
          status: true,
          paidAmount: true,
          totalAmount: true,
          pet: { select: { name: true } },
          payments: { where: { voidedAt: null }, select: { method: true, amount: true } },
        },
      },
    },
  });
}

// Clinic defaults the bill form needs on the client
export async function getBillingDefaults() {
  await requireUserId();
  const s = await prisma.clinicSettings.findUnique({ where: { id: "default" }, select: { defaultTaxRate: true, pricesIncludeTax: true } });
  return { defaultTaxRate: s?.defaultTaxRate ?? 21, pricesIncludeTax: s?.pricesIncludeTax ?? true };
}

// ---- Tax adviser ----

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

// Sends the period's package (PDF and Excel/CSV) to the adviser by e-mail and records it, so the
// documents show as sent. The adviser's address is remembered for next time.
export async function sendBookToAdviser(input: { from: string; to: string; email: string; includeInvoices: boolean; message?: string }) {
  await requirePermission("invoice.write");
  const email = input.email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "invalidEmail" as const };
  if (!emailConfigured()) return { error: "emailNotConfigured" as const };
  const pack = await buildAdviserPackage(input.from, input.to, input.includeInvoices);
  const { l, clinic } = pack;
  const html = `
    <div style="font-family:Arial,sans-serif;font-size:14px;color:#222">
      <p>${escapeHtml(input.message?.trim() || l.emailGreeting)}</p>
      <table style="border-collapse:collapse;margin:12px 0">
        <tr><td style="padding:3px 16px 3px 0;color:#666">${escapeHtml(l.period)}</td><td><b>${escapeHtml(pack.periodLabel)}</b></td></tr>
        <tr><td style="padding:3px 16px 3px 0;color:#666">${escapeHtml(l.docsCount)}</td><td>${pack.docCount}</td></tr>
        <tr><td style="padding:3px 16px 3px 0;color:#666">${escapeHtml(l.taxBase)}</td><td>${pack.taxBase.toFixed(2).replace(".", ",")} €</td></tr>
        <tr><td style="padding:3px 16px 3px 0;color:#666">${escapeHtml(l.vatShort)}</td><td>${pack.taxAmount.toFixed(2).replace(".", ",")} €</td></tr>
        <tr><td style="padding:3px 16px 3px 0;color:#666">${escapeHtml(l.total)}</td><td><b>${pack.total.toFixed(2).replace(".", ",")} €</b></td></tr>
      </table>
      <p style="color:#666">${escapeHtml(l.emailAttached)}</p>
      <p>${escapeHtml(clinic.legalName || clinic.name)}${clinic.nif ? ` · NIF ${escapeHtml(clinic.nif)}` : ""}<br>${escapeHtml([clinic.phone, clinic.email].filter(Boolean).join(" · "))}</p>
    </div>`;
  try {
    await sendWithAttachments({
      to: email,
      replyTo: clinic.email ?? undefined,
      subject: `${l.bookTitle} ${pack.periodLabel} — ${clinic.legalName || clinic.name}`,
      html,
      attachments: [
        { filename: `${pack.fileBase}.pdf`, content: Buffer.from(pack.pdf) },
        { filename: `${pack.fileBase}.csv`, content: Buffer.from(pack.csv, "utf-8") },
      ],
    });
  } catch {
    return { error: "sendFailed" as const };
  }
  await prisma.clinicSettings.update({ where: { id: "default" }, data: { adviserEmail: email } });
  const exp = await recordAdviserExport(input.from, input.to, "EMAIL", email);
  return { sent: true as const, docCount: exp.docCount };
}
