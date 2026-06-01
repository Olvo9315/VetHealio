"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { z } from "zod";

export type ServiceFlat = {
  id: string;
  name: string;
  price: number | null;
  color: string | null;
  isActive: boolean;
  sortOrder: number;
  parentId: string | null;
};

export type ServiceNode = ServiceFlat & {
  children: ServiceNode[];
};

export type SelectedService = { id: string; name: string; price: number | null };

const serviceSchema = z.object({
  name: z.string().min(1).max(100),
  price: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
    z.number().nonnegative().nullable()
  ),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional().transform((v) => v ?? null),
  parentId: z.string().cuid().nullable().optional().transform((v) => v ?? null),
  sortOrder: z.coerce.number().int().default(0),
});

export async function getServiceTree(): Promise<ServiceNode[]> {
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
  return roots as unknown as ServiceNode[];
}

export async function getServicesFlat(): Promise<ServiceFlat[]> {
  return prisma.service.findMany({
    where: { isActive: true },
    orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }],
    select: { id: true, name: true, price: true, color: true, isActive: true, sortOrder: true, parentId: true },
  });
}

export async function createService(data: unknown) {
  const session = await auth();
  if (!session) return { error: "Unauthorized" };

  const parsed = serviceSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.flatten() };

  const { name, price, color, parentId, sortOrder } = parsed.data;

  const service = await prisma.service.create({
    data: { name, price, color: color ?? null, parentId: parentId ?? null, sortOrder },
  });

  revalidatePath("/services");
  return { service };
}

export async function updateService(id: string, data: unknown) {
  const session = await auth();
  if (!session) return { error: "Unauthorized" };

  const parsed = serviceSchema.partial().safeParse(data);
  if (!parsed.success) return { error: parsed.error.flatten() };

  const service = await prisma.service.update({
    where: { id },
    data: parsed.data,
  });

  revalidatePath("/services");
  return { service };
}

export async function deleteService(id: string) {
  const session = await auth();
  if (!session) return { error: "Unauthorized" };

  const hasChildren = await prisma.service.count({ where: { parentId: id } });
  if (hasChildren > 0) return { error: "has_children" };

  const inUse =
    (await prisma.appointment.count({ where: { serviceId: id } })) +
    (await prisma.invoiceItem.count({ where: { serviceId: id } }));
  if (inUse > 0) return { error: "in_use" };

  await prisma.service.delete({ where: { id } });

  revalidatePath("/services");
  return { ok: true };
}

export async function reorderServices(items: { id: string; sortOrder: number }[]) {
  const session = await auth();
  if (!session) return { error: "Unauthorized" };

  await prisma.$transaction(
    items.map(({ id, sortOrder }) => prisma.service.update({ where: { id }, data: { sortOrder } }))
  );

  revalidatePath("/services");
  return { ok: true };
}
