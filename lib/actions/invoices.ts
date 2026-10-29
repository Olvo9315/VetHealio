"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { subDays, format, startOfMonth, endOfMonth } from "date-fns";
import { Prisma } from "@prisma/client";
import { getLocale } from "next-intl/server";
import { getDateLocale } from "@/lib/date-locale";
import { getServiceRelationLocalizer } from "@/lib/service-i18n";
import { requirePermission, requireUserId } from "@/lib/permissions";
import { getClinic } from "@/lib/clinic";
import { cents } from "@/lib/format";
import { syncInvoiceStock } from "@/lib/stock";
import type {
  InvoiceKind,
  InvoiceStatus,
  PaymentMethod,
  InvoiceItemType,
  AppointmentType,
  Species,
} from "@prisma/client";

// ---- Types ----

export type InvoiceFull = {
  id: string;
  number: number;
  status: InvoiceStatus;
  totalAmount: number;
  paidAmount: number;
  paymentMethod: PaymentMethod | null;
  paidAt: Date | null;
  createdAt: Date;
  petId: string;
  pet: {
    name: string;
    species: Species;
    owner: { id: string; firstName: string; lastName: string; phone: string; email: string | null; nif: string | null; address: string | null; postalCode: string | null };
  };
  payments: {
    id: string;
    amount: number;
    method: PaymentMethod;
    paidAt: Date;
    note: string | null;
    receivedBy: { name: string } | null;
    voidedAt: Date | null;
    voidReason: string | null;
    voidedBy: { name: string } | null;
  }[];
  // Fiscal documents issued for this bill (ticket, full invoice, rectifying), oldest first
  documents: {
    id: string;
    kind: InvoiceKind;
    series: string;
    year: number;
    number: number;
    issuedAt: Date;
    total: number;
    customerName: string;
    customerNif: string | null;
    replacesId: string | null;
    // Already handed to the tax adviser
    exportId: string | null;
  }[];
  appointmentId: string | null;
  appointment: {
    id: string;
    title: string;
    startTime: Date;
    type: AppointmentType | null;
    pet: {
      name: string;
      species: Species;
      owner: { firstName: string; lastName: string; phone: string };
    };
    veterinarian: { name: string };
  } | null;
  items: {
    id: string;
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
    type: InvoiceItemType | null;
    taxRate: number;
    serviceId: string | null;
    service: { name: string } | null;
    inventoryItemId: string | null;
  }[];
};

export type InvoiceStats = {
  revenueThisMonth: number;
  revenuePending: number;
  invoicesThisMonth: number;
  paidThisMonth: number;
};

export type ChartPoint = { date: string; amount: number };

export type AppointmentOption = {
  id: string;
  title: string;
  startTime: Date;
  type: AppointmentType | null;
  service: { id: string; name: string; officialName?: string; price: number | null } | null;
  // Further services of the appointment: each becomes its own invoice line
  extraServices?: { id: string; name: string; officialName?: string; price: number | null }[];
  pet: { name: string; owner: { firstName: string; lastName: string } };
};

// ---- Schemas ----

const invoiceItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.coerce.number().int().positive(),
  unitPrice: z.coerce.number().positive(),
  taxRate: z.coerce.number().min(0).max(30).optional(),
  inventoryItemId: z.string().cuid().nullable().optional().transform((v) => v ?? null),
  type: z.nativeEnum({ CONSULTATION: "CONSULTATION", MEDICATION: "MEDICATION", SERVICE: "SERVICE", OTHER: "OTHER" } as Record<InvoiceItemType, InvoiceItemType>).optional(),
  serviceId: z.string().cuid().nullable().optional().transform((v) => v ?? null),
});

const invoiceSchema = z.object({
  appointmentId: z.string().min(1),
  items: z.array(invoiceItemSchema).min(1),
});

const directInvoiceSchema = z.object({
  petId: z.string().min(1),
  items: z.array(invoiceItemSchema).min(1),
});

export type InvoiceFormData = z.input<typeof invoiceSchema>;
export type DirectInvoiceFormData = z.input<typeof directInvoiceSchema>;

// ---- Include helper ----

const fullInclude = {
  pet: {
    select: {
      name: true,
      species: true,
      owner: { select: { id: true, firstName: true, lastName: true, phone: true, email: true, nif: true, address: true, postalCode: true } },
    },
  },
  payments: {
    select: {
      id: true,
      amount: true,
      method: true,
      paidAt: true,
      note: true,
      receivedBy: { select: { name: true } },
      voidedAt: true,
      voidReason: true,
      voidedBy: { select: { name: true } },
    },
    orderBy: { paidAt: "asc" as const },
  },
  documents: {
    select: {
      id: true,
      kind: true,
      series: true,
      year: true,
      number: true,
      issuedAt: true,
      total: true,
      customerName: true,
      customerNif: true,
      replacesId: true,
      exportId: true,
    },
    orderBy: { issuedAt: "asc" as const },
  },
  appointment: {
    select: {
      id: true,
      title: true,
      startTime: true,
      type: true,
      pet: {
        select: {
          name: true,
          species: true,
          owner: { select: { firstName: true, lastName: true, phone: true } },
        },
      },
      veterinarian: { select: { name: true } },
    },
  },
  items: {
    select: {
      id: true,
      description: true,
      quantity: true,
      unitPrice: true,
      total: true,
      type: true,
      taxRate: true,
      serviceId: true,
      service: { select: { name: true, translations: true } },
      inventoryItemId: true,
    },
  },
} as const;

async function localizeInvoice(invoice: InvoiceFull): Promise<InvoiceFull> {
  const localize = await getServiceRelationLocalizer();
  return { ...invoice, items: invoice.items.map(localize) };
}

// ---- Queries ----

export async function getInvoices(filters?: {
  status?: InvoiceStatus | "ALL";
  search?: string;
}): Promise<InvoiceFull[]> {
  const { status, search } = filters ?? {};
  const invoices = (await prisma.invoice.findMany({
    where: {
      ...(status && status !== "ALL" ? { status } : {}),
      ...(search
        ? {
            OR: [
              { pet: { name: { contains: search, mode: "insensitive" } } },
              { pet: { owner: { firstName: { contains: search, mode: "insensitive" } } } },
              { pet: { owner: { lastName: { contains: search, mode: "insensitive" } } } },
              { appointment: { title: { contains: search, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    include: fullInclude,
    orderBy: { createdAt: "desc" },
    take: 100,
  })) as unknown as InvoiceFull[];
  const localize = await getServiceRelationLocalizer();
  return invoices.map((inv) => ({ ...inv, items: inv.items.map(localize) }));
}

export async function getInvoiceById(id: string): Promise<InvoiceFull | null> {
  const invoice = (await prisma.invoice.findUnique({
    where: { id },
    include: fullInclude,
  })) as unknown as InvoiceFull | null;
  return invoice && localizeInvoice(invoice);
}

export async function getInvoiceStats(): Promise<InvoiceStats> {
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const [received, pending, countThisMonth, paidThisMonth] = await Promise.all([
    // Money actually received this month (partial payments included)
    prisma.payment.aggregate({
      where: { paidAt: { gte: monthStart, lte: monthEnd }, voidedAt: null, invoice: { status: { not: "CANCELLED" } } },
      _sum: { amount: true },
    }),
    prisma.invoice.aggregate({
      where: { status: "PENDING" },
      _sum: { totalAmount: true, paidAmount: true },
    }),
    prisma.invoice.count({
      where: { createdAt: { gte: monthStart, lte: monthEnd } },
    }),
    prisma.invoice.count({ where: { status: "PAID", paidAt: { gte: monthStart, lte: monthEnd } } }),
  ]);

  return {
    revenueThisMonth: received._sum.amount ?? 0,
    // What is still owed on unpaid bills
    revenuePending: (pending._sum.totalAmount ?? 0) - (pending._sum.paidAmount ?? 0),
    invoicesThisMonth: countThisMonth,
    paidThisMonth,
  };
}

export async function getRevenueChartData(days: number = 30): Promise<ChartPoint[]> {
  const from = subDays(new Date(), days - 1);
  from.setHours(0, 0, 0, 0);

  const dateLocale = getDateLocale(await getLocale());
  const payments = await prisma.payment.findMany({
    where: { paidAt: { gte: from }, voidedAt: null, invoice: { status: { not: "CANCELLED" } } },
    select: { paidAt: true, amount: true },
  });

  return Array.from({ length: days }, (_, i) => {
    const d = new Date(from);
    d.setDate(from.getDate() + i);
    const dateKey = format(d, "yyyy-MM-dd");
    const amount = payments
      .filter((p) => format(new Date(p.paidAt), "yyyy-MM-dd") === dateKey)
      .reduce((sum, p) => sum + p.amount, 0);
    return { date: format(d, "d MMM", { locale: dateLocale }), amount };
  });
}

export async function searchAppointmentsWithoutInvoice(
  query: string,
  excludeAppointmentId?: string
): Promise<AppointmentOption[]> {
  if (!query || query.length < 2) return [];
  const options = (await prisma.appointment.findMany({
    where: {
      AND: [
        {
          OR: [
            { pet: { name: { contains: query, mode: "insensitive" } } },
            { pet: { owner: { firstName: { contains: query, mode: "insensitive" } } } },
            { pet: { owner: { lastName: { contains: query, mode: "insensitive" } } } },
            { title: { contains: query, mode: "insensitive" } },
          ],
        },
        {
          OR: [
            { invoice: null },
            ...(excludeAppointmentId ? [{ id: excludeAppointmentId }] : []),
          ],
        },
      ],
    },
    select: {
      id: true,
      title: true,
      startTime: true,
      type: true,
      service: { select: { id: true, name: true, price: true, translations: true } },
      extraServices: {
        orderBy: { sortOrder: "asc" },
        select: { service: { select: { id: true, name: true, price: true, translations: true } } },
      },
      pet: {
        select: {
          name: true,
          owner: { select: { firstName: true, lastName: true } },
        },
      },
    },
    orderBy: { startTime: "desc" },
    take: 10,
  })) as unknown as (Omit<AppointmentOption, "extraServices"> & { extraServices: { service: { id: string; name: string; price: number | null } }[] })[];
  const localize = await getServiceRelationLocalizer();
  return options.map((o) => ({
    ...localize(o),
    extraServices: o.extraServices.map((row) => localize({ service: row.service }).service!),
  }));
}

// ---- Mutations ----

async function buildItems(items: z.infer<typeof invoiceItemSchema>[]) {
  const { defaultTaxRate } = await getClinic();
  return items.map((item) => ({
    description: item.description,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    total: cents(item.quantity * item.unitPrice),
    type: item.type as InvoiceItemType | undefined,
    taxRate: item.taxRate ?? defaultTaxRate,
    serviceId: item.serviceId ?? null,
    inventoryItemId: item.inventoryItemId ?? null,
  }));
}

// A bill with fiscal documents is closed: it is corrected with a rectifying document instead
async function isIssued(id: string) {
  return (await prisma.fiscalDocument.count({ where: { invoiceId: id } })) > 0;
}

export async function createInvoice(data: InvoiceFormData) {
  await requirePermission("invoice.write");
  const parsed = invoiceSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.flatten() };

  const appointment = await prisma.appointment.findUnique({
    where: { id: parsed.data.appointmentId },
    select: { petId: true },
  });
  if (!appointment) return { error: "appointmentNotFound" };

  const items = await buildItems(parsed.data.items);
  const totalAmount = cents(items.reduce((s, i) => s + i.total, 0));
  const userId = await requireUserId();

  try {
    const invoice = await prisma.$transaction(async (tx) => {
      const created = await tx.invoice.create({
        data: {
          petId: appointment.petId,
          appointmentId: parsed.data.appointmentId,
          totalAmount,
          items: { create: items },
        },
      });
      await syncInvoiceStock(tx, created.id, items, userId);
      return tx.invoice.findUniqueOrThrow({ where: { id: created.id }, include: fullInclude });
    });

    revalidatePath("/finances");
    return { invoice: await localizeInvoice(invoice as unknown as InvoiceFull) };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      // Let the UI offer to open the existing invoice instead
      const existing = await prisma.invoice.findUnique({
        where: { appointmentId: parsed.data.appointmentId },
        include: fullInclude,
      });
      return {
        error: "invoiceExists" as const,
        existing: existing ? await localizeInvoice(existing as unknown as InvoiceFull) : null,
      };
    }
    throw e;
  }
}

export async function createDirectInvoice(data: DirectInvoiceFormData) {
  await requirePermission("invoice.write");
  const parsed = directInvoiceSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.flatten() };

  const items = await buildItems(parsed.data.items);
  const totalAmount = cents(items.reduce((s, i) => s + i.total, 0));
  const userId = await requireUserId();

  const invoice = await prisma.$transaction(async (tx) => {
    const created = await tx.invoice.create({
      data: { petId: parsed.data.petId, totalAmount, items: { create: items } },
    });
    await syncInvoiceStock(tx, created.id, items, userId);
    return tx.invoice.findUniqueOrThrow({ where: { id: created.id }, include: fullInclude });
  });

  revalidatePath("/finances");
  revalidatePath(`/patients/${parsed.data.petId}`);
  return { invoice: await localizeInvoice(invoice as unknown as InvoiceFull) };
}

export async function updateInvoice(id: string, data: InvoiceFormData) {
  await requirePermission("invoice.write");
  const parsed = invoiceSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.flatten() };

  const appointment = await prisma.appointment.findUnique({
    where: { id: parsed.data.appointmentId },
    select: { petId: true },
  });
  if (!appointment) return { error: "appointmentNotFound" };
  if (await isIssued(id)) return { error: "invoiceIssued" as const };

  const items = await buildItems(parsed.data.items);
  const totalAmount = cents(items.reduce((s, i) => s + i.total, 0));
  const userId = await requireUserId();

  const invoice = await prisma.$transaction(async (tx) => {
    await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
    const current = await tx.invoice.findUniqueOrThrow({ where: { id }, select: { paidAmount: true } });
    await tx.invoice.update({
      where: { id },
      data: {
        petId: appointment.petId,
        appointmentId: parsed.data.appointmentId,
        totalAmount,
        // Paid bills that grow are pending again; ones now covered by their payments are paid
        status: current.paidAmount + 0.005 >= totalAmount ? "PAID" : "PENDING",
        items: { create: items },
      },
    });
    await syncInvoiceStock(tx, id, items, userId);
    return tx.invoice.findUniqueOrThrow({ where: { id }, include: fullInclude });
  });

  revalidatePath("/finances");
  return { invoice: await localizeInvoice(invoice as unknown as InvoiceFull) };
}

export async function deleteInvoice(id: string) {
  await requirePermission("invoice.void");
  // Issued bills stay on record (they are cancelled with a rectifying document)
  if (await isIssued(id)) return { error: "invoiceIssued" as const };
  const userId = await requireUserId();
  await prisma.$transaction(async (tx) => {
    await syncInvoiceStock(tx, id, [], userId);
    await tx.invoice.delete({ where: { id } });
  });
  revalidatePath("/finances");
  revalidatePath("/inventory");
  return { success: true };
}
