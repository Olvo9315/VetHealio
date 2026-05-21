"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { addDays } from "date-fns";
import { getStockStatus, getExpiryStatus } from "@/lib/utils/inventoryHelpers";
export type { StockStatus, ExpiryStatus } from "@/lib/utils/inventoryHelpers";
export { getStockStatus, getExpiryStatus };

// ---- Types ----

export type InventoryItem = {
  id: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  minStock: number;
  unitCost: number | null;
  expiryDate: Date | null;
  supplier: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type InventoryStats = {
  totalItems: number;
  lowStockCount: number;
  expiringSoonCount: number;
  expiredCount: number;
  totalValue: number;
};

// ---- Schema ----

const inventorySchema = z.object({
  name: z.string().min(1).max(100),
  category: z.string().min(1).max(50),
  quantity: z.coerce.number().min(0),
  unit: z.string().min(1).max(30),
  minStock: z.coerce.number().min(0).default(0),
  unitCost: z.coerce.number().positive().optional().or(z.literal("")),
  expiryDate: z.string().optional().or(z.literal("")),
  supplier: z.string().max(100).optional().or(z.literal("")),
  notes: z.string().max(500).optional().or(z.literal("")),
});

export type InventoryFormData = z.infer<typeof inventorySchema>;

// ---- Queries ----

export async function getInventoryItems(filters?: {
  search?: string;
  category?: string;
  stockStatus?: "ALL" | "LOW" | "OUT" | "OK";
}): Promise<InventoryItem[]> {
  const { search, category, stockStatus } = filters ?? {};

  const items = await prisma.inventoryItem.findMany({
    where: {
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { category: { contains: search, mode: "insensitive" } },
              { supplier: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(category && category !== "ALL" ? { category } : {}),
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    take: 200,
  }) as unknown as InventoryItem[];

  if (!stockStatus || stockStatus === "ALL") return items;
  return items.filter((item) => getStockStatus(item) === stockStatus);
}

export async function getInventoryStats(): Promise<InventoryStats> {
  const items = await prisma.inventoryItem.findMany({
    select: { quantity: true, minStock: true, unitCost: true, expiryDate: true },
  }) as unknown as InventoryItem[];

  const now = new Date();
  const in30 = addDays(now, 30);

  return {
    totalItems: items.length,
    lowStockCount: items.filter((i) => getStockStatus(i) !== "OK").length,
    expiringSoonCount: items.filter((i) => {
      if (!i.expiryDate) return false;
      const d = new Date(i.expiryDate);
      return d >= now && d <= in30;
    }).length,
    expiredCount: items.filter((i) => i.expiryDate && new Date(i.expiryDate) < now).length,
    totalValue: items.reduce((s, i) => s + (i.unitCost ?? 0) * i.quantity, 0),
  };
}

export async function getDistinctCategories(): Promise<string[]> {
  const rows = await prisma.inventoryItem.findMany({
    select: { category: true },
    distinct: ["category"],
    orderBy: { category: "asc" },
  });
  return rows.map((r) => r.category);
}

// ---- Mutations ----

export async function createInventoryItem(data: InventoryFormData) {
  const parsed = inventorySchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.flatten() };

  const item = await prisma.inventoryItem.create({
    data: {
      name: parsed.data.name,
      category: parsed.data.category,
      quantity: Number(parsed.data.quantity),
      unit: parsed.data.unit,
      minStock: Number(parsed.data.minStock),
      unitCost: parsed.data.unitCost ? Number(parsed.data.unitCost) : null,
      expiryDate: parsed.data.expiryDate ? new Date(parsed.data.expiryDate) : null,
      supplier: parsed.data.supplier || null,
      notes: parsed.data.notes || null,
    },
  });

  revalidatePath("/inventory");
  return { item: item as unknown as InventoryItem };
}

export async function updateInventoryItem(id: string, data: InventoryFormData) {
  const parsed = inventorySchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.flatten() };

  const item = await prisma.inventoryItem.update({
    where: { id },
    data: {
      name: parsed.data.name,
      category: parsed.data.category,
      quantity: Number(parsed.data.quantity),
      unit: parsed.data.unit,
      minStock: Number(parsed.data.minStock),
      unitCost: parsed.data.unitCost ? Number(parsed.data.unitCost) : null,
      expiryDate: parsed.data.expiryDate ? new Date(parsed.data.expiryDate) : null,
      supplier: parsed.data.supplier || null,
      notes: parsed.data.notes || null,
    },
  });

  revalidatePath("/inventory");
  return { item: item as unknown as InventoryItem };
}

export async function adjustStock(id: string, delta: number) {
  const current = await prisma.inventoryItem.findUnique({
    where: { id },
    select: { quantity: true },
  });
  if (!current) return { error: "Not found" };

  const newQty = Math.max(0, current.quantity + delta);
  const item = await prisma.inventoryItem.update({
    where: { id },
    data: { quantity: newQty },
  });

  revalidatePath("/inventory");
  return { item: item as unknown as InventoryItem };
}

export async function deleteInventoryItem(id: string) {
  await prisma.inventoryItem.delete({ where: { id } });
  revalidatePath("/inventory");
  return { success: true };
}
