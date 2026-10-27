"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getServiceLocalizer, type ServiceTranslations } from "@/lib/service-i18n";
import { requirePermission } from "@/lib/permissions";

export type ServiceFlat = {
  id: string;
  name: string;
  price: number | null;
  color: string | null;
  isActive: boolean;
  sortOrder: number;
  parentId: string | null;
  // Set by the localizer: stored official name and per-language display names
  officialName?: string;
  translations?: ServiceTranslations;
};

export type ServiceNode = ServiceFlat & {
  children: ServiceNode[];
};

export type SelectedService = { id: string; name: string; officialName?: string; price: number | null };

const serviceSchema = z.object({
  name: z.string().min(1).max(100),
  price: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
    z.number().nonnegative().nullable()
  ),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional().transform((v) => v ?? null),
  parentId: z.string().cuid().nullable().optional().transform((v) => v ?? null),
  sortOrder: z.coerce.number().int().default(0),
  // Display names in other UI languages; empty strings are dropped
  translations: z
    .partialRecord(z.enum(["es", "ru", "en"]), z.string().trim().max(100))
    .optional()
    .transform((t) => (t ? Object.fromEntries(Object.entries(t).filter(([, v]) => v)) : undefined)),
});

// Updates only touch the fields sent: no default sortOrder/parentId (which would reorder or re-parent)
const updateSchema = serviceSchema
  .extend({
    sortOrder: z.coerce.number().int().optional(),
    parentId: z.string().cuid().nullable().optional(),
  })
  .partial();

export async function getServiceTree(): Promise<ServiceNode[]> {
  const localize = await getServiceLocalizer();
  const localizeTree = (nodes: ServiceNode[]): ServiceNode[] =>
    nodes.map((n) => ({ ...localize(n), children: localizeTree(n.children ?? []) }));
  const roots = await prisma.service.findMany({
    where: { parentId: null, isActive: true },
    orderBy: { sortOrder: "asc" },
    include: {
      children: {
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
        include: {
          children: {
            where: { isActive: true },
            orderBy: { sortOrder: "asc" },
          },
        },
      },
    },
  });
  return localizeTree(roots as unknown as ServiceNode[]);
}

export async function getServicesFlat(): Promise<ServiceFlat[]> {
  const localize = await getServiceLocalizer();
  const services = await prisma.service.findMany({
    where: { isActive: true },
    orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }],
    select: { id: true, name: true, price: true, color: true, isActive: true, sortOrder: true, parentId: true, translations: true },
  });
  return services.map(localize);
}

export async function createService(data: unknown) {
  await requirePermission("catalog.manage");

  const parsed = serviceSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.flatten() };

  const { name, price, color, parentId, sortOrder, translations } = parsed.data;

  const service = await prisma.service.create({
    data: { name, price, color: color ?? null, parentId: parentId ?? null, sortOrder, translations: translations ?? {} },
  });

  revalidatePath("/services");
  return { service };
}

export async function updateService(id: string, data: unknown) {
  await requirePermission("catalog.manage");

  const parsed = updateSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.flatten() };

  const service = await prisma.service.update({
    where: { id },
    data: parsed.data,
  });

  revalidatePath("/services");
  return { service };
}

export async function deleteService(id: string) {
  await requirePermission("catalog.manage");

  const hasChildren = await prisma.service.count({ where: { parentId: id } });
  if (hasChildren > 0) return { error: "has_children" };

  const inUse =
    (await prisma.appointment.count({ where: { serviceId: id } })) +
    (await prisma.appointmentService.count({ where: { serviceId: id } })) +
    (await prisma.invoiceItem.count({ where: { serviceId: id } }));
  if (inUse > 0) return { error: "in_use" };

  await prisma.service.delete({ where: { id } });

  revalidatePath("/services");
  return { ok: true };
}

export async function reorderServices(items: { id: string; sortOrder: number }[]) {
  await requirePermission("catalog.manage");

  await prisma.$transaction(
    items.map(({ id, sortOrder }) => prisma.service.update({ where: { id }, data: { sortOrder } }))
  );

  revalidatePath("/services");
  return { ok: true };
}
