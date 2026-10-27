"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { subDays, format, startOfMonth, endOfMonth } from "date-fns";
import { Prisma } from "@prisma/client";
import { getLocale } from "next-intl/server";
import { getDateLocale } from "@/lib/date-locale";
import { getServiceRelationLocalizer } from "@/lib/service-i18n";
import { requirePermission } from "@/lib/permissions";
import type {
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
  paymentMethod: PaymentMethod | null;
  paidAt: Date | null;
  createdAt: Date;
  petId: string;
  pet: {
    name: string;
    species: Species;
    owner: { firstName: string; lastName: string; phone: string };
  };
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
    serviceId: string | null;
    service: { name: string } | null;
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

export type InvoiceFormData = z.infer<typeof invoiceSchema>;
export type DirectInvoiceFormData = z.infer<typeof directInvoiceSchema>;

// ---- Include helper ----

const fullInclude = {
  pet: {
    select: {
      name: true,
      species: true,
      owner: { select: { firstName: true, lastName: true, phone: true } },
    },
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
      serviceId: true,
      service: { select: { name: true, translations: true } },
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

export async function getInvoiceStats(): Promise<InvoiceStats> {
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const [paidThisMonth, pending, countThisMonth] = await Promise.all([
    prisma.invoice.aggregate({
      where: { status: "PAID", paidAt: { gte: monthStart, lte: monthEnd } },
      _sum: { totalAmount: true },
      _count: true,
    }),
    prisma.invoice.aggregate({
      where: { status: "PENDING" },
      _sum: { totalAmount: true },
    }),
    prisma.invoice.count({
      where: { createdAt: { gte: monthStart, lte: monthEnd } },
    }),
  ]);

  return {
    revenueThisMonth: paidThisMonth._sum.totalAmount ?? 0,
    revenuePending: pending._sum.totalAmount ?? 0,
    invoicesThisMonth: countThisMonth,
    paidThisMonth: paidThisMonth._count,
  };
}

export async function getRevenueChartData(days: number = 30): Promise<ChartPoint[]> {
  const from = subDays(new Date(), days - 1);
  from.setHours(0, 0, 0, 0);

  const dateLocale = getDateLocale(await getLocale());
  const invoices = await prisma.invoice.findMany({
    where: { status: "PAID", paidAt: { gte: from } },
    select: { paidAt: true, totalAmount: true },
  });

  return Array.from({ length: days }, (_, i) => {
    const d = new Date(from);
    d.setDate(from.getDate() + i);
    const dateKey = format(d, "yyyy-MM-dd");
    const amount = invoices
      .filter((inv) => inv.paidAt && format(new Date(inv.paidAt), "yyyy-MM-dd") === dateKey)
      .reduce((sum, inv) => sum + inv.totalAmount, 0);
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

function buildItems(items: z.infer<typeof invoiceItemSchema>[]) {
  return items.map((item) => ({
    description: item.description,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    total: item.quantity * item.unitPrice,
    type: item.type as InvoiceItemType | undefined,
    serviceId: item.serviceId ?? null,
  }));
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

  const items = buildItems(parsed.data.items);
  const totalAmount = items.reduce((s, i) => s + i.total, 0);

  try {
    const invoice = await prisma.invoice.create({
      data: {
        petId: appointment.petId,
        appointmentId: parsed.data.appointmentId,
        totalAmount,
        items: { create: items },
      },
      include: fullInclude,
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

  const items = buildItems(parsed.data.items);
  const totalAmount = items.reduce((s, i) => s + i.total, 0);

  const invoice = await prisma.invoice.create({
    data: {
      petId: parsed.data.petId,
      totalAmount,
      items: { create: items },
    },
    include: fullInclude,
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

  await prisma.invoiceItem.deleteMany({ where: { invoiceId: id } });

  const items = buildItems(parsed.data.items);
  const totalAmount = items.reduce((s, i) => s + i.total, 0);

  const invoice = await prisma.invoice.update({
    where: { id },
    data: {
      petId: appointment.petId,
      appointmentId: parsed.data.appointmentId,
      totalAmount,
      items: { create: items },
    },
    include: fullInclude,
  });

  revalidatePath("/finances");
  return { invoice: await localizeInvoice(invoice as unknown as InvoiceFull) };
}

export async function updateInvoiceStatus(
  id: string,
  status: InvoiceStatus,
  paymentMethod?: PaymentMethod
) {
  await requirePermission(status === "CANCELLED" ? "invoice.void" : "invoice.write");
  const invoice = await prisma.invoice.update({
    where: { id },
    data: {
      status,
      paymentMethod: paymentMethod ?? null,
      paidAt: status === "PAID" ? new Date() : null,
    },
    include: fullInclude,
  });

  revalidatePath("/finances");
  return localizeInvoice(invoice as unknown as InvoiceFull);
}

export async function deleteInvoice(id: string) {
  await requirePermission("invoice.void");
  await prisma.invoice.delete({ where: { id } });
  revalidatePath("/finances");
  return { success: true };
}
